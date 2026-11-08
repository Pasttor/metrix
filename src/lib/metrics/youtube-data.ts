import "server-only";
import { addDays, dateInTimeZone } from "@/lib/dates";
import { createClient } from "@/lib/db/server";
import { getEnv } from "@/lib/env";
import type { Range } from "@/lib/range";
import { periodEndingOn, type Period } from "./period";
import { computeKpis, dailySeries, latestAnalyticsDate, subscriberSeries, type Kpi, type MetricRow, type SeriesPoint, type SubscriberPoint } from "./youtube";
import { buildAudience, buildVideoRows, viewGrowth, type Audience, type GrowthPoint, type VideoRow } from "./youtube-content";

/**
 * Dashboard reads, always from the database with the user's session (RLS),
 * never from the live API.
 */

type Db = Awaited<ReturnType<typeof createClient>>;
const PAGE = 1000;

function fail(operation: string, error: { code?: string }): never {
  throw new Error(`Database error in ${operation}${error.code ? ` (${error.code})` : ""}`);
}

/** PostgREST caps responses at 1,000 rows; page through with stable ordering. */
async function selectAll<T>(operation: string, page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) fail(operation, error);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export type YouTubeAccount = {
  id: string;
  name: string | null;
  handle: string | null;
  status: string;
  lastSyncedAt: string | null;
};

export async function getYouTubeAccount(db?: Db): Promise<YouTubeAccount | null> {
  const client = db ?? (await createClient());
  const { data, error } = await client
    .from("accounts")
    .select("id, name, handle, status, last_synced_at")
    .eq("platform", "youtube")
    .order("connected_at")
    .limit(1)
    .maybeSingle();
  if (error) fail("accounts.youtube", error);
  return data ? { id: data.id, name: data.name, handle: data.handle, status: data.status, lastSyncedAt: data.last_synced_at } : null;
}

export type YouTubeOverview = {
  period: Period;
  kpis: Kpi[];
  views: SeriesPoint[];
  subscribers: SubscriberPoint[];
  hasData: boolean;
};

export async function getYouTubeOverview(accountId: string, range: Range): Promise<YouTubeOverview> {
  const db = await createClient();
  const today = dateInTimeZone(new Date(), getEnv().REPORT_TIMEZONE);

  const { data: latest, error } = await db
    .from("account_metrics_daily")
    .select("date")
    .eq("account_id", accountId)
    .eq("metric", "views")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("account_metrics_daily.latest", error);

  // Analytics arrive late: end the period on the last day with data so both windows are complete.
  const period = periodEndingOn(latest?.date ?? today, range);
  const rows: MetricRow[] = (
    await selectAll("account_metrics_daily.range", (from, to) =>
      db
        .from("account_metrics_daily")
        .select("date, metric, value")
        .eq("account_id", accountId)
        .gte("date", period.previousStart)
        .lte("date", today)
        .order("date")
        .order("metric")
        .range(from, to),
    )
  ).map((row) => ({ date: row.date, metric: row.metric, value: Number(row.value) }));

  return {
    period,
    kpis: computeKpis(rows, period),
    views: dailySeries(rows, "views", period),
    // Subscriber snapshots are taken today, ahead of the analytics lag.
    subscribers: subscriberSeries(rows, { start: period.start, end: today }),
    hasData: latestAnalyticsDate(rows) !== null || rows.some((row) => row.metric === "subscriberCount"),
  };
}

const COUNTERS = ["viewCount", "likeCount", "commentCount"];

export async function getYouTubeVideos(accountId: string): Promise<VideoRow[]> {
  const db = await createClient();
  const posts = await selectAll("posts.list", (from, to) =>
    db
      .from("posts")
      .select("id, type, caption, permalink, thumbnail_url, published_at, duration_seconds")
      .eq("account_id", accountId)
      .order("published_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  if (posts.length === 0) return [];

  const { data: latest, error } = await db
    .from("post_metric_snapshots")
    .select("captured_on, posts!inner(account_id)")
    .eq("posts.account_id", accountId)
    .order("captured_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("post_metric_snapshots.latest", error);

  // Counters are cumulative: the last week of snapshots is enough to find each video's latest value.
  const snapshots = latest
    ? await selectAll("post_metric_snapshots.recent", (from, to) =>
        db
          .from("post_metric_snapshots")
          .select("post_id, captured_on, metric, value, posts!inner(account_id)")
          .eq("posts.account_id", accountId)
          .in("metric", COUNTERS)
          .gte("captured_on", addDays(latest.captured_on, -7))
          .order("captured_on")
          .order("post_id")
          .order("metric")
          .range(from, to),
      )
    : [];

  return buildVideoRows(
    posts.map((post) => ({
      id: post.id,
      type: post.type,
      caption: post.caption,
      permalink: post.permalink,
      thumbnailUrl: post.thumbnail_url,
      publishedAt: post.published_at,
      durationSeconds: post.duration_seconds,
    })),
    snapshots.map((row) => ({ postId: row.post_id, capturedOn: row.captured_on, metric: row.metric, value: Number(row.value) })),
  );
}

export type YouTubeAudience = Audience & { date: string | null };

export async function getYouTubeAudience(accountId: string): Promise<YouTubeAudience> {
  const db = await createClient();
  const { data: latest, error } = await db
    .from("audience_snapshots")
    .select("date")
    .eq("account_id", accountId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("audience_snapshots.latest", error);
  if (!latest) return { date: null, ...buildAudience([]) };

  const { data, error: rowsError } = await db
    .from("audience_snapshots")
    .select("dimension, key, value")
    .eq("account_id", accountId)
    .eq("date", latest.date);
  if (rowsError) fail("audience_snapshots.list", rowsError);
  return { date: latest.date, ...buildAudience(data.map((row) => ({ ...row, value: Number(row.value) }))) };
}

export type VideoDetail = {
  id: string;
  title: string;
  type: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  growth: GrowthPoint[];
  /** Latest lifetime Analytics values (refreshed weekly for recent videos). */
  lifetime: { estimatedMinutesWatched: number | null; averageViewDuration: number | null; averageViewPercentage: number | null };
  latest: { views: number | null; likes: number | null; comments: number | null };
};

const LIFETIME = ["estimatedMinutesWatched", "averageViewDuration", "averageViewPercentage"] as const;

export async function getVideoDetail(postId: string): Promise<VideoDetail | null> {
  const db = await createClient();
  const { data: post, error } = await db
    .from("posts")
    .select("id, type, caption, permalink, thumbnail_url, published_at, duration_seconds, accounts!inner(platform)")
    .eq("id", postId)
    .eq("accounts.platform", "youtube")
    .maybeSingle();
  if (error) fail("posts.get", error);
  if (!post) return null;

  const snapshots = await selectAll("post_metric_snapshots.post", (from, to) =>
    db
      .from("post_metric_snapshots")
      .select("captured_on, metric, value")
      .eq("post_id", postId)
      .order("captured_on")
      .order("metric")
      .range(from, to),
  );
  const latestOf = (metric: string) => {
    const rows = snapshots.filter((row) => row.metric === metric);
    return rows.length ? Number(rows[rows.length - 1].value) : null;
  };

  return {
    id: post.id,
    title: post.caption ?? "Sin título",
    type: post.type,
    permalink: post.permalink,
    thumbnailUrl: post.thumbnail_url,
    publishedAt: post.published_at,
    durationSeconds: post.duration_seconds,
    growth: viewGrowth(snapshots.filter((row) => row.metric === "viewCount").map((row) => ({ capturedOn: row.captured_on, value: Number(row.value) }))),
    lifetime: Object.fromEntries(LIFETIME.map((metric) => [metric, latestOf(metric)])) as VideoDetail["lifetime"],
    latest: { views: latestOf("viewCount"), likes: latestOf("likeCount"), comments: latestOf("commentCount") },
  };
}
