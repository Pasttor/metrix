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
  durationSeconds: number | null;
};

export type PostMetricValue = { postId: string; metric: string; value: number };
export type AudienceValue = { dimension: AudienceDimension; key: string; value: number };
export type StoredPost = { id: string; externalId: string; publishedAt: string | null };

export interface MetricsStore {
  upsertAccountMetrics(accountId: string, rows: MetricValue[]): Promise<number>;
  /** Upserts by (account, external id) without touching `raw`; returns external id → post id. */
  upsertPosts(accountId: string, posts: PostUpsert[]): Promise<Map<string, string>>;
  upsertPostMetrics(capturedOn: string, rows: PostMetricValue[]): Promise<number>;
  upsertAudience(accountId: string, date: string, rows: AudienceValue[]): Promise<number>;
  /** Posts published at or after `since`. */
  listPostsSince(accountId: string, since: Date): Promise<StoredPost[]>;
}
