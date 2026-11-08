import { dateInTimeZone } from "@/lib/dates";
import type { MetricValue, PostType, PostUpsert } from "@/lib/sync/metrics-store";
import type { RetentionCache } from "@/lib/sync/metrics-store";
import type { FbPost, FbVideo, Insights } from "./schemas";

/**
 * Page Insights names confirmed against the reference and a live Page (Graph
 * API v26). Reach and unique video view metrics were removed in v25
 * (page_impressions_unique, page_video_views_unique...); page_fans and
 * page_impressions were retired in Nov 2025. page_media_view replaces impressions.
 */
export const FB_PAGE_DAILY_METRICS = [
  "page_follows",
  "page_total_media_view_unique",
  "page_post_engagements",
  "page_video_views",
  "page_media_view",
];

const POST_METRICS = ["post_total_media_view_unique", "post_media_view", "post_reactions_by_type_total", "post_clicks"];
/**
 * Video metrics (confirmed on live Reels): 3 s views, average and total watch
 * time (milliseconds), complete views and 15 s views.
 */
const VIDEO_METRICS = [
  "post_video_views",
  "post_video_avg_time_watched",
  "post_video_view_time",
  "post_video_complete_views_organic",
  "post_video_views_15s",
];

/** Per-video call: Reels plays, replays and the retention graph (41 points, 0..40 = share of the video). */
export const FB_VIDEO_INSIGHTS = ["blue_reels_play_count", "fb_reels_total_plays", "fb_reels_replay_count", "post_video_retention_graph"];
const RETENTION_GRAPH = "post_video_retention_graph";
const RETENTION_INTERVALS = 40;

export function fbPostType(post: FbPost): PostType {
  if (post.permalink_url?.includes("/reel/")) return "reel";
  const mediaType = post.attachments?.data[0]?.media_type;
  if (mediaType === "video") return "video";
  if (mediaType === "photo") return "image";
  if (mediaType === "album") return "carousel";
  return "post";
}

export function fbPostMetricsFor(type: PostType): string[] {
  return type === "video" || type === "reel" ? [...POST_METRICS, ...VIDEO_METRICS] : POST_METRICS;
}

export function fbPostToUpsert(post: FbPost): PostUpsert {
  return {
    externalId: post.id,
    type: fbPostType(post),
    caption: post.message ?? null,
    permalink: post.permalink_url ?? null,
    thumbnailUrl: post.full_picture ?? null,
    publishedAt: post.created_time ?? null,
    // Known only from the per-video call: left out so the stored length is kept.
    durationSeconds: undefined,
  };
}

/** The video behind a video/Reel post (needed for length, plays and retention). */
export function fbVideoId(post: FbPost): string | null {
  const attachment = post.attachments?.data[0];
  return attachment?.media_type === "video" ? (attachment.target?.id ?? null) : null;
}

/**
 * `post_video_retention_graph`: keys 0..40 split the video into 40 equal parts
 * (always 41 points, whatever the length); values are the share still watching.
 */
export function retentionFromGraph(graph: unknown): RetentionCache["points"] {
  if (!graph || typeof graph !== "object" || Array.isArray(graph)) return [];
  return Object.entries(graph as Record<string, unknown>)
    .flatMap(([key, value]) => {
      const index = Number(key);
      return Number.isInteger(index) && typeof value === "number"
        ? [{ ratio: index / RETENTION_INTERVALS, audienceWatchRatio: value, relativePerformance: null }]
        : [];
    })
    .sort((a, b) => a.ratio - b.ratio);
}

/** Length, Reels counters and retention from the per-video call. */
export function parseVideoDetails(video: FbVideo) {
  const items = video.video_insights?.data ?? [];
  const graph = items.find((item) => item.name === RETENTION_GRAPH)?.values?.[0]?.value;
  return {
    lengthSeconds: typeof video.length === "number" ? Math.round(video.length) : null,
    metrics: items.flatMap((item) => {
      const value = item.values?.[0]?.value;
      return item.name !== RETENTION_GRAPH && typeof value === "number" ? [{ metric: item.name, value }] : [];
    }),
    retention: retentionFromGraph(graph),
  };
}

/** Counters that come with the post itself. `shares` is omitted by Meta when nobody shared: skipped, not 0. */
export function fbPostFieldMetrics(post: FbPost): { metric: string; value: number }[] {
  const values: [string, number | undefined][] = [
    ["reactions", post.reactions?.summary?.total_count],
    ["comments", post.comments?.summary?.total_count],
    ["shares", post.shares?.count],
  ];
  return values.flatMap(([metric, value]) => (typeof value === "number" ? [{ metric, value }] : []));
}

/**
 * Daily Page values. Each `end_time` marks the end of the day in Pacific time,
 * so the value belongs to the day before it.
 */
export function pageDailyRows(insights: Insights, timeZone: string): MetricValue[] {
  return insights.data.flatMap((item) =>
    (item.values ?? []).flatMap((entry) => {
      if (typeof entry.value !== "number" || !entry.end_time) return [];
      const date = dateInTimeZone(new Date(Date.parse(entry.end_time) - 1000), timeZone);
      return [{ date, metric: item.name, value: entry.value }];
    }),
  );
}

/**
 * Lifetime post values. `post_reactions_by_type_total` is an object
 * ({like: 3, love: 1}): saved as its total plus one metric per type; an empty
 * object (no reactions yet) writes nothing.
 */
export function postInsightRows(insights: Insights): { metric: string; value: number }[] {
  // A metric can come back once per period (lifetime and day): keep the lifetime one.
  const hasLifetime = new Set(insights.data.filter((item) => item.period === "lifetime").map((item) => item.name));
  return insights.data.flatMap((item) => {
    if (hasLifetime.has(item.name) && item.period !== "lifetime") return [];
    const value = item.values?.[0]?.value;
    if (typeof value === "number") return [{ metric: item.name, value }];
    // Only reactions come as a breakdown object; graphs (retention) are handled apart.
    if (item.name === "post_reactions_by_type_total" && value && typeof value === "object" && !Array.isArray(value)) {
      const entries = Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, number] => typeof entry[1] === "number");
      if (entries.length === 0) return [];
      return [
        { metric: item.name, value: entries.reduce((sum, [, n]) => sum + n, 0) },
        ...entries.map(([type, n]) => ({ metric: `${item.name}.${type}`, value: n })),
      ];
    }
    return [];
  });
}
