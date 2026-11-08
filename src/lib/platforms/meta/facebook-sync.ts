import { z } from "zod";
import { addDays, dateInTimeZone, daysBetween, isMonday, startOfDayInTimeZone } from "@/lib/dates";
import { ReauthRequiredError, type AccessTokenGetter } from "@/lib/oauth/token-store";
import type { FetchFn, RetryOptions } from "@/lib/platforms/http";
import type { MetricsStore, PostMetricValue } from "@/lib/sync/metrics-store";
import type { AccountSyncInput, AccountSyncResult, Syncer } from "@/lib/sync/types";
import { createMetaClient, isMetaAuthError, isMetaRejected } from "./client";
import {
  FB_PAGE_DAILY_METRICS,
  FB_VIDEO_INSIGHTS,
  fbPostFieldMetrics,
  fbPostMetricsFor,
  fbPostToUpsert,
  fbVideoId,
  pageDailyRows,
  parseVideoDetails,
  postInsightRows,
} from "./facebook-parsers";
import { fetchInsights, isNoInsights, type InsightsContext } from "./insights";
import { fbPageProfileSchema, fbPostSchema, fbVideoSchema, type FbPost, type FbVideo } from "./schemas";

/** Page insight days are Pacific-time days. */
export const FB_INSIGHTS_TIME_ZONE = "America/Los_Angeles";
export const FB_DAILY_LOOKBACK_DAYS = 3;
/**
 * since/until can span at most 90 days. Blocks are 89 calendar days so a block
 * crossing a DST change (one extra hour) still fits.
 */
export const FB_BLOCK_DAYS = 89;
const FB_MAX_SPAN_DAYS = 90;
/** Meta keeps two years of Page insights. */
export const FB_MAX_HISTORY_DAYS = 730;
export const FB_RECENT_POST_DAYS = 30;

const POST_FIELDS =
  "id,message,created_time,permalink_url,full_picture,shares,comments.summary(true).limit(0),reactions.summary(true).limit(0),attachments{media_type,type,target{id}}";
const STEPS = ["profile", "page", "posts"] as const;

const cursorSchema = z.object({ step: z.enum(STEPS), before: z.iso.date().optional(), index: z.number().int().min(0).optional() });
type Cursor = z.infer<typeof cursorSchema>;

export type FacebookSyncDeps = {
  getAccessToken: AccessTokenGetter;
  markReauthRequired: (accountId: string) => Promise<void>;
  store: MetricsStore;
  version: string;
  reportTimeZone: string;
  fetch?: FetchFn;
  retry?: RetryOptions;
};

/**
 * Daily: followers snapshot, last 3 finished days of Page insights (one call),
 * published posts with their counters and lifetime insights for posts of the
 * last 30 days (all posts on Mondays). Backfill: Page insights in 90-day blocks
 * going back until a block has no data (at most 2 years), then every post.
 */
export function createFacebookSyncer(deps: FacebookSyncDeps): Syncer {
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
    const graph = createMetaClient({ version: deps.version, accessToken: await deps.getAccessToken(account.id), fetch: deps.fetch, retry: deps.retry });
    const pageId = account.externalId;
    const warnings = new Set<string>();
    let rowsWritten = 0;

    const reportDate = dateInTimeZone(now, deps.reportTimeZone);
    const insightsToday = dateInTimeZone(now, FB_INSIGHTS_TIME_ZONE);
    const yesterday = addDays(insightsToday, -1);
    const parsed = cursorSchema.safeParse(rawCursor);
    const resume: Cursor | null = parsed.success ? parsed.data : null;
    const firstStep = resume ? STEPS.indexOf(resume.step) : 0;
    const fullPostRefresh = job === "backfill" || isMonday(reportDate);

    const ctx: InsightsContext = {
      graph,
      warnings,
      onRetired: async (metric) => {
        const scope = metric.startsWith("post_") ? "post" : "account";
        await deps.store.markMetricDeprecated?.("facebook", scope, metric);
      },
    };

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
      warnings: [...warnings],
      quotaUnits: graph.calls,
      progress: done ? 1 : Math.min(0.99, (STEPS.indexOf(cursor!.step) + stepProgress) / STEPS.length),
    });

    /**
     * One call per video: its length plus Reels plays/replays and the retention
     * graph. Plain (non-Reel) videos may reject the Reels counters: then only
     * the retention graph is asked.
     */
    async function videoDetails(videoId: string): Promise<FbVideo | null> {
      const fields = (metrics: string[]) => `length,video_insights.metric(${metrics.join(",")})`;
      try {
        return await graph.get(videoId, { fields: fields(FB_VIDEO_INSIGHTS) }, fbVideoSchema, "meta.fb.video");
      } catch (error) {
        if (isNoInsights(error)) return null;
        if (!isMetaRejected(error)) throw error;
      }
      try {
        return await graph.get(videoId, { fields: fields(["post_video_retention_graph"]) }, fbVideoSchema, "meta.fb.video");
      } catch (error) {
        if (!isMetaRejected(error) && !isNoInsights(error)) throw error;
        warnings.add("algunos videos no tienen curva de retención disponible");
        return null;
      }
    }

    /** Page insights for [from, to]; returns the rows inside that range. */
    async function pageDays(from: string, to: string) {
      if (daysBetween(from, to) + 1 > FB_MAX_SPAN_DAYS) throw new RangeError("Page insights span over 90 days");
      const params = {
        period: "day",
        since: String(Math.floor(startOfDayInTimeZone(from, FB_INSIGHTS_TIME_ZONE) / 1000)),
        until: String(Math.floor(startOfDayInTimeZone(addDays(to, 1), FB_INSIGHTS_TIME_ZONE) / 1000)),
      };
      const insights = await fetchInsights(ctx, `${pageId}/insights`, params, FB_PAGE_DAILY_METRICS, "página");
      return pageDailyRows(insights, FB_INSIGHTS_TIME_ZONE).filter((row) => row.date >= from && row.date <= to);
    }

    for (let index = firstStep; index < STEPS.length; index++) {
      const step = STEPS[index];
      const resumeHere = resume && index === firstStep ? resume : null;
      if (index > firstStep && stop()) return result(false, { step });

      if (step === "profile") {
        const page = await graph.get(pageId, { fields: "followers_count,fan_count" }, fbPageProfileSchema, "meta.fb.page");
        const followers = page.followers_count ?? page.fan_count;
        if (typeof followers === "number") {
          rowsWritten += await deps.store.upsertAccountMetrics(account.id, [{ date: reportDate, metric: "followers_count", value: followers }]);
        }
      }

      if (step === "page") {
        if (job === "daily") {
          const rows = await pageDays(addDays(yesterday, -(FB_DAILY_LOOKBACK_DAYS - 1)), yesterday);
          if (rows.length > 0) rowsWritten += await deps.store.upsertAccountMetrics(account.id, rows);
        } else {
          // Walk back in blocks until one has no data or Meta's 2-year limit.
          const oldest = addDays(insightsToday, -FB_MAX_HISTORY_DAYS);
          let to = resumeHere?.before ?? yesterday;
          while (to > oldest) {
            const from = addDays(to, -(FB_BLOCK_DAYS - 1)) < oldest ? oldest : addDays(to, -(FB_BLOCK_DAYS - 1));
            const rows = await pageDays(from, to);
            // Older blocks come back as zeros: an all-zero block means no more history.
            if (!rows.some((row) => row.value !== 0)) break;
            rowsWritten += await deps.store.upsertAccountMetrics(account.id, rows);
            to = addDays(from, -1);
            if (to > oldest && stop()) {
              return result(false, { step, before: to }, daysBetween(to, yesterday) / FB_MAX_HISTORY_DAYS);
            }
          }
        }
      }

      if (step === "posts") {
        const posts: FbPost[] = await graph.getAll(`${pageId}/published_posts`, { fields: POST_FIELDS, limit: "100" }, fbPostSchema, "meta.fb.posts");
        const ids = await deps.store.upsertPosts(account.id, posts.map(fbPostToUpsert));
        const recentSince = now.getTime() - FB_RECENT_POST_DAYS * 86_400_000;
        const start = resumeHere?.index ?? 0;
        if (start === 0) {
          rowsWritten += ids.size;
          const fieldRows: PostMetricValue[] = posts.flatMap((post) => {
            const postId = ids.get(post.id);
            return postId ? fbPostFieldMetrics(post).map((row) => ({ postId, ...row })) : [];
          });
          if (fieldRows.length > 0) rowsWritten += await deps.store.upsertPostMetrics(reportDate, fieldRows);
        }

        const targets = fullPostRefresh ? posts : posts.filter((post) => post.created_time && Date.parse(post.created_time) >= recentSince);
        for (let i = start; i < targets.length; i++) {
          if (i > start && stop()) return result(false, { step, index: i }, i / targets.length);
          const post = targets[i];
          const postId = ids.get(post.id);
          if (!postId) continue;
          try {
            // Without a period Meta also returns today's values for some metrics; ask only for lifetime totals.
            const insights = await fetchInsights(ctx, `${post.id}/insights`, { period: "lifetime" }, fbPostMetricsFor(fbPostToUpsert(post).type), "post");
            const rows = postInsightRows(insights).map((row) => ({ postId, ...row }));

            const videoId = fbVideoId(post);
            const video = videoId ? await videoDetails(videoId) : null;
            if (video) {
              const details = parseVideoDetails(video);
              rows.push(...details.metrics.map((row) => ({ postId, ...row })));
              await deps.store.savePostDetails?.(postId, {
                durationSeconds: details.lengthSeconds,
                ...(details.retention.length > 0 ? { retention: { fetchedAt: now.toISOString(), points: details.retention } } : {}),
              });
            }
            if (rows.length > 0) rowsWritten += await deps.store.upsertPostMetrics(reportDate, rows);
          } catch (error) {
            if (!isNoInsights(error)) throw error;
          }
        }
      }
    }

    return result(true);
  }
}
