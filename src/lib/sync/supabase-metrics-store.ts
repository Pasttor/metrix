import "server-only";
import type { AdminClient } from "@/lib/db/admin";
import type { Json } from "@/lib/db/types";
import type { MetricsStore } from "./metrics-store";

const CHUNK = 500;

function fail(operation: string, error: { code?: string } | null): never {
  throw new Error(`Database error in ${operation}${error?.code ? ` (${error.code})` : ""}`);
}

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/** service_role writer for the metric tables. Duplicate keys within a batch are collapsed (last wins). */
export function supabaseMetricsStore(db: AdminClient, now: () => Date = () => new Date()): MetricsStore {
  function dedupe<T>(rows: T[], key: (row: T) => string): T[] {
    return [...new Map(rows.map((row) => [key(row), row])).values()];
  }

  return {
    async upsertAccountMetrics(accountId, rows) {
      const capturedAt = now().toISOString();
      const unique = dedupe(rows, (row) => `${row.date}|${row.metric}`);
      for (const batch of chunks(unique)) {
        const { error } = await db.from("account_metrics_daily").upsert(
          batch.map((row) => ({ account_id: accountId, date: row.date, metric: row.metric, value: row.value, captured_at: capturedAt })),
          { onConflict: "account_id,date,metric" },
        );
        if (error) fail("account_metrics_daily.upsert", error);
      }
      return unique.length;
    },

    async upsertPosts(accountId, posts) {
      const ids = new Map<string, string>();
      for (const batch of chunks(dedupe(posts, (post) => post.externalId))) {
        const { data, error } = await db
          .from("posts")
          .upsert(
            batch.map((post) => ({
              account_id: accountId,
              external_id: post.externalId,
              type: post.type,
              caption: post.caption,
              permalink: post.permalink,
              thumbnail_url: post.thumbnailUrl,
              published_at: post.publishedAt,
              // Omitted uniformly per call when the syncer does not know it, so it is not reset.
              ...(post.durationSeconds !== undefined ? { duration_seconds: post.durationSeconds } : {}),
            })),
            { onConflict: "account_id,external_id" },
          )
          .select("id, external_id");
        if (error || !data) fail("posts.upsert", error);
        for (const row of data) ids.set(row.external_id, row.id);
      }
      return ids;
    },

    async upsertPostMetrics(capturedOn, rows) {
      const unique = dedupe(rows, (row) => `${row.postId}|${row.metric}`);
      for (const batch of chunks(unique)) {
        const { error } = await db.from("post_metric_snapshots").upsert(
          batch.map((row) => ({ post_id: row.postId, captured_on: capturedOn, metric: row.metric, value: row.value })),
          { onConflict: "post_id,captured_on,metric" },
        );
        if (error) fail("post_metric_snapshots.upsert", error);
      }
      return unique.length;
    },

    async upsertAudience(accountId, date, rows) {
      const unique = dedupe(rows, (row) => `${row.dimension}|${row.key}`);
      for (const batch of chunks(unique)) {
        const { error } = await db.from("audience_snapshots").upsert(
          batch.map((row) => ({ account_id: accountId, date, dimension: row.dimension, key: row.key, value: row.value })),
          { onConflict: "account_id,date,dimension,key" },
        );
        if (error) fail("audience_snapshots.upsert", error);
      }
      return unique.length;
    },

    async listPostsSince(accountId, since) {
      const { data, error } = await db
        .from("posts")
        .select("id, external_id, published_at")
        .eq("account_id", accountId)
        .gte("published_at", since.toISOString())
        .order("published_at", { ascending: false });
      if (error) fail("posts.listSince", error);
      return data.map((row) => ({ id: row.id, externalId: row.external_id, publishedAt: row.published_at }));
    },

    async savePostDetails(postId, details) {
      const update: { duration_seconds?: number | null; raw?: Json } = {};
      if (details.durationSeconds !== undefined) update.duration_seconds = details.durationSeconds;
      if (details.retention) {
        const { data, error } = await db.from("posts").select("raw").eq("id", postId).single();
        if (error) fail("posts.raw", error);
        const raw = data.raw && typeof data.raw === "object" && !Array.isArray(data.raw) ? data.raw : {};
        update.raw = { ...raw, retention: details.retention } as unknown as Json;
      }
      if (Object.keys(update).length === 0) return;
      const { error } = await db.from("posts").update(update).eq("id", postId);
      if (error) fail("posts.details", error);
    },

    async markMetricDeprecated(platform, scope, metric) {
      const { error } = await db
        .from("metric_catalog")
        .update({ deprecated_at: now().toISOString() })
        .eq("platform", platform)
        .eq("scope", scope)
        .eq("metric", metric)
        .is("deprecated_at", null);
      if (error) fail("metric_catalog.deprecate", error);
    },
  };
}
