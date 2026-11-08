import { z } from "zod";
import { addDays, dateInTimeZone, daysBetween, isMonday, startOfDayInTimeZone } from "@/lib/dates";
import { ReauthRequiredError, type AccessTokenGetter } from "@/lib/oauth/token-store";
import type { FetchFn, RetryOptions } from "@/lib/platforms/http";
import type { MetricsStore, PostMetricValue } from "@/lib/sync/metrics-store";
import type { AccountSyncInput, AccountSyncResult, Syncer } from "@/lib/sync/types";
import { createMetaClient, isMetaAuthError, isMetaRejected, type MetaClient } from "./client";
import { fetchInsights, isBeforeConversion, isNoInsights, type InsightsContext } from "./insights";
import {
  demographicRows,
  IG_ACCOUNT_DAILY_METRICS,
  IG_DEMOGRAPHIC_BREAKDOWNS,
  insightValues,
  mediaMetricsFor,
  mediaPostType,
  mediaToPost,
} from "./instagram-parsers";
import { igMediaSchema, igProfileSchema, insightsSchema, type IgMedia, type Insights } from "./schemas";

/** Instagram insight days are Pacific-time days (end_time 07:00/08:00 UTC). */
export const IG_INSIGHTS_TIME_ZONE = "America/Los_Angeles";
/** Account insights arrive up to 48 h late: re-request the last few days each run. */
export const IG_DAILY_LOOKBACK_DAYS = 3;
/** Instagram keeps 90 days of account insights. */
export const IG_BACKFILL_DAYS = 90;
/** Posts younger than this get fresh insights every day; older ones weekly. */
export const IG_RECENT_POST_DAYS = 30;

const MEDIA_FIELDS = "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp";
const STEPS = ["profile", "account", "media", "stories", "demographics"] as const;
type Step = (typeof STEPS)[number];

const cursorSchema = z.object({ step: z.enum(STEPS), from: z.iso.date().optional(), index: z.number().int().min(0).optional() });
type Cursor = z.infer<typeof cursorSchema>;

export type InstagramSyncDeps = {
  getAccessToken: AccessTokenGetter;
  markReauthRequired: (accountId: string) => Promise<void>;
  store: MetricsStore;
  version: string;
  reportTimeZone: string;
  fetch?: FetchFn;
  retry?: RetryOptions;
};

export function instagramStepsFor(job: AccountSyncInput["job"], reportDate: string): Step[] {
  if (job === "backfill" || isMonday(reportDate)) return [...STEPS];
  return ["profile", "account", "media", "stories"];
}

export function createInstagramSyncer(deps: InstagramSyncDeps): Syncer {
  return {
    async syncAccount(input: AccountSyncInput): Promise<AccountSyncResult> {
      try {
        return await run(input);
      } catch (error) {
        if (isMetaAuthError(error)) {
          await deps.markReauthRequired(input.account.id);
          throw new ReauthRequiredError(input.account.id);
        }
        throw error;
      }
    },
  };

  async function run({ account, job, cursor: rawCursor, shouldStop, now }: AccountSyncInput): Promise<AccountSyncResult> {
    const graph: MetaClient = createMetaClient({
      version: deps.version,
      accessToken: await deps.getAccessToken(account.id),
      fetch: deps.fetch,
      retry: deps.retry,
    });
    const igId = account.externalId;
    const warnings = new Set<string>();
    let rowsWritten = 0;
    let skippedBeforeConversion = 0;

    const reportDate = dateInTimeZone(now, deps.reportTimeZone);
    const insightsToday = dateInTimeZone(now, IG_INSIGHTS_TIME_ZONE);
    const steps = instagramStepsFor(job, reportDate);
    const parsed = cursorSchema.safeParse(rawCursor);
    const resume: Cursor | null = parsed.success && steps.includes(parsed.data.step) ? parsed.data : null;
    const firstStep = resume ? steps.indexOf(resume.step) : 0;
    const fullPostRefresh = job === "backfill" || isMonday(reportDate);

    const stop = () => {
      if (graph.overLimit) {
        warnings.add(`uso de la API de Meta al ${Math.round(graph.usage)} %; se continúa en la siguiente corrida`);
        return true;
      }
      return shouldStop();
    };

    const result = (done: boolean, cursor?: Cursor, stepProgress = 0): AccountSyncResult => ({
      done,
      ...(cursor ? { cursor } : {}),
      rowsWritten,
      warnings: [
        ...warnings,
        ...(skippedBeforeConversion > 0
          ? [`${skippedBeforeConversion} publicación(es) son anteriores al cambio a cuenta profesional y Meta no guarda sus insights`]
          : []),
      ],
      quotaUnits: graph.calls,
      progress: done ? 1 : Math.min(0.99, (steps.indexOf(cursor!.step) + stepProgress) / steps.length),
    });

    const ctx: InsightsContext = { graph, warnings };
    const insights = (path: string, params: Record<string, string>, metrics: string[], label: string) =>
      fetchInsights(ctx, path, params, metrics, label);

    async function writePostMetrics(ids: Map<string, string>, items: IgMedia[], fromIndex: number) {
      for (let i = fromIndex; i < items.length; i++) {
        if (i > fromIndex && stop()) return { stoppedAt: i };
        const media = items[i];
        const postId = ids.get(media.id);
        if (!postId) continue;
        const type = mediaPostType(media);
        let values: Map<string, number>;
        try {
          values = insightValues(await insights(`${media.id}/insights`, {}, mediaMetricsFor(type), type));
        } catch (error) {
          if (!isNoInsights(error)) throw error;
          if (isBeforeConversion(error)) skippedBeforeConversion += 1;
          continue;
        }
        const rows: PostMetricValue[] = [...values].map(([metric, value]) => ({ postId, metric, value }));
        if (rows.length > 0) rowsWritten += await deps.store.upsertPostMetrics(reportDate, rows);
      }
      return { stoppedAt: null };
    }

    for (let index = firstStep; index < steps.length; index++) {
      const step = steps[index];
      const resumeHere = resume && index === firstStep ? resume : null;
      if (index > firstStep && stop()) return result(false, { step });

      if (step === "profile") {
        const profile = await graph.get(igId, { fields: "followers_count,media_count" }, igProfileSchema, "meta.ig.profile");
        const rows = (
          [
            ["followers_count", profile.followers_count],
            ["media_count", profile.media_count],
          ] as const
        ).flatMap(([metric, value]) => (typeof value === "number" ? [{ date: reportDate, metric, value }] : []));
        if (rows.length > 0) rowsWritten += await deps.store.upsertAccountMetrics(account.id, rows);
      }

      if (step === "account") {
        // Only finished days: today's numbers are still moving.
        const end = addDays(insightsToday, -1);
        const start = job === "backfill" ? addDays(insightsToday, -IG_BACKFILL_DAYS) : addDays(end, -(IG_DAILY_LOOKBACK_DAYS - 1));
        const totalDays = Math.max(1, daysBetween(start, end) + 1);
        for (let day = resumeHere?.from ?? start; day <= end; day = addDays(day, 1)) {
          if (day !== (resumeHere?.from ?? start) && stop()) {
            return result(false, { step, from: day }, daysBetween(start, day) / totalDays);
          }
          const params = {
            period: "day",
            metric_type: "total_value",
            since: String(Math.floor(startOfDayInTimeZone(day, IG_INSIGHTS_TIME_ZONE) / 1000)),
            until: String(Math.floor(startOfDayInTimeZone(addDays(day, 1), IG_INSIGHTS_TIME_ZONE) / 1000)),
          };
          const values = insightValues(await insights(`${igId}/insights`, params, IG_ACCOUNT_DAILY_METRICS, "cuenta"));
          const rows = [...values].map(([metric, value]) => ({ date: day, metric, value }));
          if (rows.length > 0) rowsWritten += await deps.store.upsertAccountMetrics(account.id, rows);
        }
      }

      if (step === "media") {
        const items = await graph.getAll(`${igId}/media`, { fields: MEDIA_FIELDS, limit: "100" }, igMediaSchema, "meta.ig.media");
        const ids = await deps.store.upsertPosts(account.id, items.map(mediaToPost));
        if (!resumeHere) rowsWritten += ids.size;
        const recentSince = now.getTime() - IG_RECENT_POST_DAYS * 86_400_000;
        const targets = fullPostRefresh
          ? items
          : items.filter((media) => media.timestamp && new Date(media.timestamp).getTime() >= recentSince);
        const { stoppedAt } = await writePostMetrics(ids, targets, resumeHere?.index ?? 0);
        if (stoppedAt !== null) return result(false, { step, index: stoppedAt }, stoppedAt / Math.max(1, targets.length));
      }

      if (step === "stories") {
        // Only stories from the last 24 h are listed; final values arrive by webhook (T11).
        const stories = await graph.getAll(`${igId}/stories`, { fields: MEDIA_FIELDS }, igMediaSchema, "meta.ig.stories");
        if (stories.length > 0) {
          const ids = await deps.store.upsertPosts(account.id, stories.map((story) => ({ ...mediaToPost(story), type: "story" as const })));
          rowsWritten += ids.size;
          const { stoppedAt } = await writePostMetrics(ids, stories, resumeHere?.index ?? 0);
          if (stoppedAt !== null) return result(false, { step, index: stoppedAt }, stoppedAt / stories.length);
        }
      }

      if (step === "demographics") {
        // Needs 100+ followers; an empty answer writes nothing.
        const rows = [];
        for (const { breakdown, dimension } of IG_DEMOGRAPHIC_BREAKDOWNS) {
          const params = { period: "lifetime", metric_type: "total_value", breakdown, timeframe: "last_30_days" };
          let data: Insights;
          try {
            data = await graph.get(`${igId}/insights`, { ...params, metric: "follower_demographics" }, insightsSchema, "meta.insights");
          } catch (error) {
            if (!isMetaRejected(error)) throw error;
            // Meta has announced the end of some timeframes; this_month is the documented one.
            data = await graph.get(
              `${igId}/insights`,
              { ...params, timeframe: "this_month", metric: "follower_demographics" },
              insightsSchema,
              "meta.insights",
            );
          }
          rows.push(...demographicRows(data, dimension));
        }
        if (rows.length > 0) rowsWritten += await deps.store.upsertAudience(account.id, reportDate, rows);
      }
    }

    return result(true);
  }
}
