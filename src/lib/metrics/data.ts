import "server-only";
import { addDays } from "@/lib/dates";
import { createClient } from "@/lib/db/server";
import type { Json } from "@/lib/db/types";
import type { AccountPlatform } from "@/lib/oauth/types";
import type { MetricRow } from "./series";
import type { AudienceRecord, PostRecord, SnapshotRecord } from "./youtube-content";

/**
 * Database reads shared by every dashboard, always with the user's session
 * (RLS), never from the live APIs.
 */

export type Db = Awaited<ReturnType<typeof createClient>>;
const PAGE = 1000;

export function fail(operation: string, error: { code?: string }): never {
  throw new Error(`Database error in ${operation}${error.code ? ` (${error.code})` : ""}`);
}

/** PostgREST caps responses at 1,000 rows; page through with stable ordering. */
export async function selectAll<T>(
  operation: string,
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string } | null }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) fail(operation, error);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export type DashboardAccount = {
  id: string;
  name: string | null;
  handle: string | null;
  status: string;
  connectedAt: string;
  lastSyncedAt: string | null;
};

export async function getAccount(db: Db, platform: AccountPlatform): Promise<DashboardAccount | null> {
  const { data, error } = await db
    .from("accounts")
    .select("id, name, handle, status, connected_at, last_synced_at")
    .eq("platform", platform)
    .order("connected_at")
    .limit(1)
    .maybeSingle();
  if (error) fail(`accounts.${platform}`, error);
  return data
    ? { id: data.id, name: data.name, handle: data.handle, status: data.status, connectedAt: data.connected_at, lastSyncedAt: data.last_synced_at }
    : null;
}

export async function latestMetricDate(db: Db, accountId: string, metric: string): Promise<string | null> {
  const { data, error } = await db
    .from("account_metrics_daily")
    .select("date")
    .eq("account_id", accountId)
    .eq("metric", metric)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("account_metrics_daily.latest", error);
  return data?.date ?? null;
}

export async function loadMetricRows(db: Db, accountId: string, from: string, to: string): Promise<MetricRow[]> {
  const rows = await selectAll("account_metrics_daily.range", (start, end) =>
    db
      .from("account_metrics_daily")
      .select("date, metric, value")
      .eq("account_id", accountId)
      .gte("date", from)
      .lte("date", to)
      .order("date")
      .order("metric")
      .range(start, end),
  );
  return rows.map((row) => ({ date: row.date, metric: row.metric, value: Number(row.value) }));
}

export async function loadPosts(db: Db, accountId: string): Promise<PostRecord[]> {
  const posts = await selectAll("posts.list", (from, to) =>
    db
      .from("posts")
      .select("id, type, caption, permalink, thumbnail_url, published_at, duration_seconds")
      .eq("account_id", accountId)
      .order("published_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  return posts.map((post) => ({
    id: post.id,
    type: post.type,
    caption: post.caption,
    permalink: post.permalink,
    thumbnailUrl: post.thumbnail_url,
    publishedAt: post.published_at,
    durationSeconds: post.duration_seconds,
  }));
}

/**
 * Recent snapshots of the given metrics for every post of the account. Values
 * are cumulative, so the last week is enough to find each post's latest value.
 */
export async function loadRecentSnapshots(db: Db, accountId: string, metrics: string[]): Promise<SnapshotRecord[]> {
  const { data: latest, error } = await db
    .from("post_metric_snapshots")
    .select("captured_on, posts!inner(account_id)")
    .eq("posts.account_id", accountId)
    .order("captured_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("post_metric_snapshots.latest", error);
  if (!latest) return [];

  const rows = await selectAll("post_metric_snapshots.recent", (from, to) =>
    db
      .from("post_metric_snapshots")
      .select("post_id, captured_on, metric, value, posts!inner(account_id)")
      .eq("posts.account_id", accountId)
      .in("metric", metrics)
      .gte("captured_on", addDays(latest.captured_on, -7))
      .order("captured_on")
      .order("post_id")
      .order("metric")
      .range(from, to),
  );
  return rows.map((row) => ({ postId: row.post_id, capturedOn: row.captured_on, metric: row.metric, value: Number(row.value) }));
}

/** The latest audience snapshot of the account (one date, every dimension). */
export async function loadLatestAudience(db: Db, accountId: string): Promise<{ date: string | null; records: AudienceRecord[] }> {
  const { data: latest, error } = await db
    .from("audience_snapshots")
    .select("date")
    .eq("account_id", accountId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("audience_snapshots.latest", error);
  if (!latest) return { date: null, records: [] };

  const { data, error: rowsError } = await db
    .from("audience_snapshots")
    .select("dimension, key, value")
    .eq("account_id", accountId)
    .eq("date", latest.date);
  if (rowsError) fail("audience_snapshots.list", rowsError);
  return { date: latest.date, records: data.map((row) => ({ ...row, value: Number(row.value) })) };
}

export type PostWithSnapshots = { post: PostRecord; snapshots: SnapshotRecord[]; raw: Json };

/** One post of the given platform (RLS-checked) and every snapshot it has. */
export async function loadPostWithSnapshots(db: Db, postId: string, platform: AccountPlatform): Promise<PostWithSnapshots | null> {
  const { data: post, error } = await db
    .from("posts")
    .select("id, type, caption, permalink, thumbnail_url, published_at, duration_seconds, raw, accounts!inner(platform)")
    .eq("id", postId)
    .eq("accounts.platform", platform)
    .maybeSingle();
  if (error) fail("posts.get", error);
  if (!post) return null;

  const snapshots = await selectAll("post_metric_snapshots.post", (from, to) =>
    db.from("post_metric_snapshots").select("captured_on, metric, value").eq("post_id", postId).order("captured_on").order("metric").range(from, to),
  );
  return {
    post: {
      id: post.id,
      type: post.type,
      caption: post.caption,
      permalink: post.permalink,
      thumbnailUrl: post.thumbnail_url,
      publishedAt: post.published_at,
      durationSeconds: post.duration_seconds,
    },
    snapshots: snapshots.map((row) => ({ postId, capturedOn: row.captured_on, metric: row.metric, value: Number(row.value) })),
    raw: post.raw,
  };
}
