import { z } from "zod";
import { addDays, dateInTimeZone, daysBetween, isMonday, minDate } from "@/lib/dates";
import type { FetchFn, RetryOptions } from "@/lib/platforms/http";
import { HttpError } from "@/lib/platforms/http";
import type { MetricsStore, PostAudienceValue, StoredPost } from "@/lib/sync/metrics-store";
import type { AccessTokenGetter } from "@/lib/oauth/token-store";
import type { AccountSyncInput, AccountSyncResult, Syncer } from "@/lib/sync/types";
import { createYouTubeClient, VIDEOS_PER_REQUEST, type AnalyticsQuery, type YouTubeClient } from "./client";
import {
  audienceFromReport,
  breakdownDailyMetrics,
  retentionFromReport,
  channelSnapshotMetrics,
  dailyMetricsFromReport,
  videoMetricsFromReport,
  videoStatMetrics,
  videoToPost,
  type AudienceRow,
} from "./parsers";
import type { AnalyticsReport, Channel } from "./schemas";

/** YouTube Analytics reports days in Pacific time. */
export const ANALYTICS_TIME_ZONE = "America/Los_Angeles";

export const CHANNEL_DAILY_METRICS = [
  "views",
  // Shorts count a view from the first frame; engaged views are the comparable figure.
  "engagedViews",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "averageViewPercentage",
  "subscribersGained",
  "subscribersLost",
  "likes",
  "comments",
  "shares",
];
export const REVENUE_METRICS = ["estimatedRevenue"];
export const VIDEO_LIFETIME_METRICS = ["estimatedMinutesWatched", "averageViewDuration", "averageViewPercentage", "engagedViews"];
/** Split by creatorContentType (shorts, videoOnDemand, liveStream...), stored as "<metric>.content_type.<type>". */
export const CONTENT_TYPE_METRICS = ["views", "engagedViews", "estimatedMinutesWatched", "subscribersGained"];

/** Analytics data arrives late and gets adjusted: re-request this many days each run. */
export const DAILY_LOOKBACK_DAYS = 7;
export const BACKFILL_CHUNK_DAYS = 365;
export const AUDIENCE_WINDOW_DAYS = 28;
export const RECENT_VIDEO_DAYS = 90;
const YOUTUBE_LAUNCH = "2005-04-23";

const STEPS = ["snapshot", "analytics", "videos", "weekly", "videoAnalytics"] as const;
type Step = (typeof STEPS)[number];

const cursorSchema = z.object({
  step: z.enum(STEPS),
  from: z.iso.date().optional(),
  pageToken: z.string().optional(),
  index: z.number().int().min(0).optional(),
});
type Cursor = z.infer<typeof cursorSchema>;

/** Per-video daily series (from Analytics, not cumulative). */
export const VIDEO_DAILY_METRICS = [
  "views",
  "engagedViews",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "averageViewPercentage",
  "subscribersGained",
  "likes",
  "comments",
  "shares",
];
/** How many countries / search terms to keep per video. */
export const VIDEO_TOP_N = 25;

export type YouTubeSyncDeps = {
  getAccessToken: AccessTokenGetter;
  store: MetricsStore;
  monetary: boolean;
  reportTimeZone: string;
  fetch?: FetchFn;
  retry?: RetryOptions;
};

/**
 * Daily: channel snapshot, last 7 days of channel analytics, every upload with
 * its public counters and, on Mondays, audience + lifetime stats of recent videos.
 * Backfill: channel analytics since creation in 1-year blocks, then the same.
 */
export function stepsFor(job: AccountSyncInput["job"], reportDate: string): Step[] {
  if (job === "backfill") return ["analytics", "snapshot", "videos", "weekly", "videoAnalytics"];
  return isMonday(reportDate) ? ["snapshot", "analytics", "videos", "weekly", "videoAnalytics"] : ["snapshot", "analytics", "videos"];
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof HttpError && error.status === 401;
}

function isRejectedQuery(error: unknown): error is HttpError {
  return error instanceof HttpError && error.status === 400;
}

export function createYouTubeSyncer(deps: YouTubeSyncDeps): Syncer {
  return {
    async syncAccount({ account, job, cursor: rawCursor, shouldStop, now }: AccountSyncInput): Promise<AccountSyncResult> {
      const connect = async (forceRefresh: boolean) =>
        createYouTubeClient({
          accessToken: await deps.getAccessToken(account.id, { forceRefresh }),
          fetch: deps.fetch,
          retry: deps.retry,
        });
      const warnings = new Set<string>();
      let rowsWritten = 0;

      let client = await connect(false);
      let channels: Channel[];
      try {
        channels = await client.listMyChannels();
      } catch (error) {
        // 401 with an unexpired token: it was revoked or invalidated. Refresh once;
        // if Google rejects the refresh too, the account is marked for reconnection.
        if (!isUnauthorized(error)) throw error;
        client = await connect(true);
        channels = await client.listMyChannels();
      }
      const channel = channels.find((item) => item.id === account.externalId);
      if (!channel) throw new Error("El canal conectado ya no está disponible con este acceso; reconecta YouTube");

      const reportDate = dateInTimeZone(now, deps.reportTimeZone);
      const analyticsEnd = dateInTimeZone(now, ANALYTICS_TIME_ZONE);
      const createdOn = channel.snippet.publishedAt
        ? dateInTimeZone(new Date(channel.snippet.publishedAt), ANALYTICS_TIME_ZONE)
        : YOUTUBE_LAUNCH;

      const steps = stepsFor(job, reportDate);
      const parsed = cursorSchema.safeParse(rawCursor);
      const resume: Cursor | null = parsed.success && steps.includes(parsed.data.step) ? parsed.data : null;
      const firstStep = resume ? steps.indexOf(resume.step) : 0;

      const result = (done: boolean, cursor?: Cursor, stepProgress = 0): AccountSyncResult => ({
        done,
        ...(cursor ? { cursor } : {}),
        rowsWritten,
        warnings: [...warnings],
        quotaUnits: client.quotaUnits,
        progress: done ? 1 : Math.min(0.99, (steps.indexOf(cursor!.step) + stepProgress) / steps.length),
      });

      /**
       * Runs a report; if the API rejects the metric set (400), retries metric by
       * metric so one invalid or retired metric only becomes a warning.
       */
      async function queryMetrics<T>(query: Omit<AnalyticsQuery, "metrics">, metrics: string[], parse: (r: AnalyticsReport) => T[]) {
        try {
          return parse(await client.queryReport({ ...query, metrics }));
        } catch (error) {
          if (!isRejectedQuery(error)) throw error;
          if (metrics.length === 1) {
            warnings.add(`métrica ${metrics[0]} rechazada por YouTube Analytics (${error.code || "400"})`);
            return [];
          }
        }
        const rows: T[] = [];
        for (const metric of metrics) {
          // A sort by another metric of the set would be rejected on its own.
          const sortMetric = query.sort?.replace(/^-/, "");
          const sort = sortMetric && metrics.includes(sortMetric) ? query.sort!.replace(sortMetric, metric) : query.sort;
          rows.push(...(await queryMetrics({ ...query, sort }, [metric], parse)));
        }
        return rows;
      }

      async function syncChannelDays(startDate: string, endDate: string) {
        const query = { startDate, endDate, dimensions: ["day"], sort: "day" };
        const rows = await queryMetrics(query, CHANNEL_DAILY_METRICS, dailyMetricsFromReport);
        if (deps.monetary) rows.push(...(await queryMetrics(query, REVENUE_METRICS, dailyMetricsFromReport)));
        const byType = { startDate, endDate, dimensions: ["day", "creatorContentType"], sort: "day" };
        rows.push(...(await queryMetrics(byType, CONTENT_TYPE_METRICS, (report) => breakdownDailyMetrics(report, "creatorContentType", "content_type"))));
        if (rows.length > 0) rowsWritten += await deps.store.upsertAccountMetrics(account.id, rows);
      }

      for (let index = firstStep; index < steps.length; index++) {
        const step = steps[index];
        const resumeHere = resume && index === firstStep ? resume : null;
        if (index > firstStep && shouldStop()) return result(false, { step });

        if (step === "snapshot") {
          const rows = channelSnapshotMetrics(channel, reportDate);
          if (rows.length > 0) rowsWritten += await deps.store.upsertAccountMetrics(account.id, rows);
        }

        if (step === "analytics") {
          if (job === "daily") {
            await syncChannelDays(addDays(analyticsEnd, -DAILY_LOOKBACK_DAYS), analyticsEnd);
          } else {
            const totalDays = Math.max(1, daysBetween(createdOn, analyticsEnd) + 1);
            let from = resumeHere?.from ?? createdOn;
            while (from <= analyticsEnd) {
              const to = minDate(addDays(from, BACKFILL_CHUNK_DAYS - 1), analyticsEnd);
              await syncChannelDays(from, to);
              from = addDays(to, 1);
              if (from <= analyticsEnd && shouldStop()) {
                return result(false, { step, from }, daysBetween(createdOn, from) / totalDays);
              }
            }
          }
        }

        if (step === "videos") {
          const pageToken = await syncUploads(client, channel, resumeHere?.pageToken);
          if (pageToken) return result(false, { step, pageToken }, 0.5);
        }

        if (step === "weekly") {
          await syncAudience();
          await syncRecentVideos();
        }

        if (step === "videoAnalytics") {
          // Backfill: every video; weekly: videos of the last 90 days.
          const since = job === "backfill" ? new Date(0) : new Date(now.getTime() - RECENT_VIDEO_DAYS * 86_400_000);
          const posts = await deps.store.listPostsSince(account.id, since);
          const start = resumeHere?.index ?? 0;
          for (let i = start; i < posts.length; i++) {
            if (i > start && shouldStop()) return result(false, { step, index: i }, i / posts.length);
            await syncVideoAnalytics(posts[i]);
          }
        }
      }

      return result(true);

      /** Pages through the uploads playlist; returns a page token if it had to stop. */
      async function syncUploads(yt: YouTubeClient, ch: Channel, startToken?: string): Promise<string | undefined> {
        const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
        if (!uploads) {
          warnings.add("el canal no expone su lista de subidas");
          return undefined;
        }
        let pageToken = startToken;
        do {
          let page;
          try {
            page = await yt.listPlaylistVideoIds(uploads, pageToken);
          } catch (error) {
            // A channel without uploads can answer 404 playlistNotFound.
            if (error instanceof HttpError && error.status === 404) return undefined;
            throw error;
          }
          const videos = await yt.listVideos(page.videoIds);
          if (videos.length > 0) {
            const ids = await deps.store.upsertPosts(account.id, videos.map(videoToPost));
            rowsWritten += ids.size;
            const metrics = videos.flatMap(videoStatMetrics).flatMap((row) => {
              const postId = ids.get(row.externalId);
              return postId ? [{ postId, metric: row.metric, value: row.value }] : [];
            });
            if (metrics.length > 0) rowsWritten += await deps.store.upsertPostMetrics(reportDate, metrics);
          }
          pageToken = page.nextPageToken;
          if (pageToken && shouldStop()) return pageToken;
        } while (pageToken);
        return undefined;
      }

      async function syncAudience() {
        const startDate = addDays(analyticsEnd, -(AUDIENCE_WINDOW_DAYS - 1));
        const breakdowns: { dimension: AudienceRow["dimension"]; columns: string[]; metric: string; sort?: string }[] = [
          { dimension: "age_gender", columns: ["ageGroup", "gender"], metric: "viewerPercentage" },
          { dimension: "country", columns: ["country"], metric: "views", sort: "-views" },
          { dimension: "device", columns: ["deviceType"], metric: "views" },
          { dimension: "traffic_source", columns: ["insightTrafficSourceType"], metric: "views" },
        ];
        const rows: AudienceRow[] = [];
        for (const breakdown of breakdowns) {
          const query = { startDate, endDate: analyticsEnd, dimensions: breakdown.columns, sort: breakdown.sort };
          rows.push(
            ...(await queryMetrics(query, [breakdown.metric], (report) =>
              audienceFromReport(report, breakdown.dimension, breakdown.columns, breakdown.metric),
            )),
          );
        }
        if (rows.length > 0) rowsWritten += await deps.store.upsertAudience(account.id, reportDate, rows);
      }

      /**
       * One video's Analytics since it was published: its daily series, and
       * its lifetime traffic sources, countries, age/gender and YouTube search terms.
       */
      async function syncVideoAnalytics(post: StoredPost) {
        if (!deps.store.upsertPostDailyMetrics || !deps.store.upsertPostAudience) return;
        const published = post.publishedAt ? addDays(dateInTimeZone(new Date(post.publishedAt), ANALYTICS_TIME_ZONE), -1) : createdOn;
        const startDate = published < createdOn ? createdOn : published;
        if (startDate > analyticsEnd) return;
        const video = `video==${post.externalId}`;
        const base = { startDate, endDate: analyticsEnd };

        const daily = await queryMetrics({ ...base, dimensions: ["day"], filters: video, sort: "day" }, VIDEO_DAILY_METRICS, dailyMetricsFromReport);
        if (daily.length > 0) {
          rowsWritten += await deps.store.upsertPostDailyMetrics(daily.map((row) => ({ postId: post.id, ...row })));
        }

        const breakdowns = [
          { dimension: "traffic_source" as const, columns: ["insightTrafficSourceType"], metric: "views", filters: video },
          { dimension: "country" as const, columns: ["country"], metric: "views", filters: video, sort: "-views", maxResults: VIDEO_TOP_N },
          { dimension: "age_gender" as const, columns: ["ageGroup", "gender"], metric: "viewerPercentage", filters: video },
          {
            dimension: "search_term" as const,
            columns: ["insightTrafficSourceDetail"],
            metric: "views",
            filters: `${video};insightTrafficSourceType==YT_SEARCH`,
            sort: "-views",
            maxResults: VIDEO_TOP_N,
          },
        ];
        const audience: PostAudienceValue[] = [];
        for (const breakdown of breakdowns) {
          const query = { ...base, dimensions: breakdown.columns, filters: breakdown.filters, sort: breakdown.sort, maxResults: breakdown.maxResults };
          const rows = await queryMetrics(query, [breakdown.metric], (report) =>
            audienceFromReport(report, breakdown.dimension, breakdown.columns, breakdown.metric),
          );
          audience.push(...rows.map((row) => ({ postId: post.id, ...row })));
        }
        if (audience.length > 0) rowsWritten += await deps.store.upsertPostAudience(reportDate, audience);

        // The retention curve of every video, cached in posts.raw for the hooks report.
        if (deps.store.savePostDetails) {
          const retentionQuery = { ...base, dimensions: ["elapsedVideoTimeRatio"], filters: video };
          let report: AnalyticsReport | null = null;
          try {
            report = await client.queryReport({ ...retentionQuery, metrics: ["audienceWatchRatio", "relativeRetentionPerformance"] });
          } catch (error) {
            if (!isRejectedQuery(error)) throw error;
            report = await client.queryReport({ ...retentionQuery, metrics: ["audienceWatchRatio"] }).catch((retry: unknown) => {
              if (!isRejectedQuery(retry)) throw retry;
              return null;
            });
          }
          const points = report ? retentionFromReport(report).sort((a, b) => a.ratio - b.ratio) : [];
          if (points.length > 0) await deps.store.savePostDetails(post.id, { retention: { fetchedAt: now.toISOString(), points } });
        }
      }

      async function syncRecentVideos() {
        const since = new Date(now.getTime() - RECENT_VIDEO_DAYS * 86_400_000);
        const posts = await deps.store.listPostsSince(account.id, since);
        for (let i = 0; i < posts.length; i += VIDEOS_PER_REQUEST) {
          const batch = posts.slice(i, i + VIDEOS_PER_REQUEST);
          const postIds = new Map(batch.map((post) => [post.externalId, post.id]));
          const earliest = batch
            .map((post) => (post.publishedAt ? dateInTimeZone(new Date(post.publishedAt), ANALYTICS_TIME_ZONE) : createdOn))
            .reduce(minDate);
          const query = {
            startDate: earliest,
            endDate: analyticsEnd,
            dimensions: ["video"],
            filters: `video==${batch.map((post) => post.externalId).join(",")}`,
            sort: `-${VIDEO_LIFETIME_METRICS[0]}`,
            maxResults: batch.length,
          };
          const metrics = (await queryMetrics(query, VIDEO_LIFETIME_METRICS, videoMetricsFromReport)).flatMap((row) => {
            const postId = postIds.get(row.externalId);
            return postId ? [{ postId, metric: row.metric, value: row.value }] : [];
          });
          if (metrics.length > 0) rowsWritten += await deps.store.upsertPostMetrics(reportDate, metrics);
        }
      }
    },
  };
}
