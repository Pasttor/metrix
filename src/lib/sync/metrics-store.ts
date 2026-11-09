/**
 * Writes to the long-format metric tables, shared by every platform syncer.
 * All writes are upserts by primary key so any sync can be repeated.
 * Each method returns how many rows it wrote.
 */

export type PostType = "video" | "short" | "reel" | "image" | "carousel" | "story" | "post" | "live";
export type AudienceDimension = "age" | "gender" | "age_gender" | "country" | "city" | "device" | "traffic_source";

export type MetricValue = { date: string; metric: string; value: number };

export type PostUpsert = {
  externalId: string;
  type: PostType;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  /** Omit to leave the stored duration untouched (it may come from a later call). */
  durationSeconds?: number | null;
};

/** Cached retention curve in posts.raw.retention (same shape for every network). */
export type RetentionCache = {
  fetchedAt: string;
  points: { ratio: number; audienceWatchRatio: number; relativePerformance: number | null }[];
};

export type PostMetricValue = { postId: string; metric: string; value: number };
export type AudienceValue = { dimension: AudienceDimension; key: string; value: number };
/** A post's value on a given day from analytics (not cumulative). */
export type PostDailyValue = { postId: string; date: string; metric: string; value: number };
export type PostAudienceDimension = "traffic_source" | "country" | "age_gender" | "search_term" | "city" | "device";
export type PostAudienceValue = { postId: string; dimension: PostAudienceDimension; key: string; value: number };

export type Competitor = { id: string; username: string };

export type StoredPost = { id: string; externalId: string; publishedAt: string | null };

export interface MetricsStore {
  upsertAccountMetrics(accountId: string, rows: MetricValue[]): Promise<number>;
  /** Upserts by (account, external id) without touching `raw`; returns external id → post id. */
  upsertPosts(accountId: string, posts: PostUpsert[]): Promise<Map<string, string>>;
  upsertPostMetrics(capturedOn: string, rows: PostMetricValue[]): Promise<number>;
  upsertAudience(accountId: string, date: string, rows: AudienceValue[]): Promise<number>;
  upsertPostDailyMetrics?(rows: PostDailyValue[]): Promise<number>;
  /** Lifetime breakdowns of posts (sources, countries, search terms...) as of `capturedOn`. */
  upsertPostAudience?(capturedOn: string, rows: PostAudienceValue[]): Promise<number>;
  listCompetitors?(platform: "instagram"): Promise<Competitor[]>;
  saveCompetitorSnapshot?(
    competitorId: string,
    date: string,
    profile: { name: string | null; avatarUrl: string | null },
    rows: { metric: string; value: number }[],
  ): Promise<number>;
  /** Posts published at or after `since`. */
  listPostsSince(accountId: string, since: Date): Promise<StoredPost[]>;
  /** Saves details that come from a separate call: video length and the retention curve (merged into raw). */
  savePostDetails?(postId: string, details: { durationSeconds?: number | null; retention?: RetentionCache }): Promise<void>;
  /** Flags a catalog metric the API now rejects as retired (only the first time). */
  markMetricDeprecated?(platform: string, scope: "account" | "post" | "audience", metric: string): Promise<void>;
}
