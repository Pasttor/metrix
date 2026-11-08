import type { AudienceDimension, PostType, PostUpsert } from "@/lib/sync/metrics-store";
import type { IgMedia, Insights } from "./schemas";

/**
 * Instagram metric names, confirmed against the IG User / IG Media Insights
 * reference and a live account (Graph API v26): every account metric needs
 * `metric_type=total_value`; Reels watch times come in milliseconds and
 * `reels_skip_rate` as a 0–100 percentage.
 */
export const IG_ACCOUNT_DAILY_METRICS = [
  "views",
  "reach",
  "accounts_engaged",
  "total_interactions",
  "likes",
  "comments",
  "shares",
  "saves",
  "replies",
  "profile_links_taps",
  "follows_and_unfollows",
  "reposts",
];

const FEED_METRICS = ["views", "reach", "likes", "comments", "shares", "saved", "total_interactions", "reposts", "total_likes", "total_comments", "total_views"];
const REELS_METRICS = [...FEED_METRICS, "ig_reels_avg_watch_time", "ig_reels_video_view_total_time", "reels_skip_rate"];
const STORY_METRICS = ["views", "reach", "replies", "shares", "link_clicks", "navigation"];

export const IG_DEMOGRAPHIC_BREAKDOWNS: { breakdown: string; dimension: AudienceDimension }[] = [
  { breakdown: "age", dimension: "age" },
  { breakdown: "gender", dimension: "gender" },
  { breakdown: "country", dimension: "country" },
  { breakdown: "city", dimension: "city" },
];

export function mediaPostType(media: Pick<IgMedia, "media_type" | "media_product_type">): PostType {
  if (media.media_product_type === "STORY") return "story";
  if (media.media_product_type === "REELS") return "reel";
  if (media.media_type === "CAROUSEL_ALBUM") return "carousel";
  if (media.media_type === "IMAGE") return "image";
  return "video";
}

/** Insights to request for a media item. Carousel children are never listed, so only the album is asked. */
export function mediaMetricsFor(type: PostType): string[] {
  if (type === "story") return STORY_METRICS;
  if (type === "reel") return REELS_METRICS;
  return FEED_METRICS;
}

export function mediaToPost(media: IgMedia): PostUpsert {
  const type = mediaPostType(media);
  return {
    externalId: media.id,
    type,
    caption: media.caption ?? null,
    permalink: media.permalink ?? null,
    // Videos expose a thumbnail; images only their own URL.
    thumbnailUrl: media.thumbnail_url ?? (media.media_type === "IMAGE" ? (media.media_url ?? null) : null),
    publishedAt: media.timestamp ?? null,
    durationSeconds: null,
  };
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * One value per metric from an insights response: `total_value.value`, else the
 * first of `values`. A breakdown-only metric (story navigation) sums its results.
 * Metrics missing from the response are skipped, never written as 0.
 */
export function insightValues(insights: Insights): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of insights.data) {
    let value = numeric(item.total_value?.value) ?? numeric(item.values?.[0]?.value);
    if (value === null && item.total_value?.breakdowns?.length) {
      const results = item.total_value.breakdowns.flatMap((breakdown) => breakdown.results ?? []);
      if (results.length > 0) value = results.reduce((sum, entry) => sum + entry.value, 0);
    }
    if (value !== null) result.set(item.name, value);
  }
  return result;
}

/** `follower_demographics` with one breakdown → audience rows (empty under 100 followers). */
export function demographicRows(insights: Insights, dimension: AudienceDimension) {
  return insights.data.flatMap((item) =>
    (item.total_value?.breakdowns ?? []).flatMap((breakdown) =>
      (breakdown.results ?? []).flatMap((entry) => {
        const key = entry.dimension_values.join("|");
        return key ? [{ dimension, key, value: entry.value }] : [];
      }),
    ),
  );
}
