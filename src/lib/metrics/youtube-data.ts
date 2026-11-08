import "server-only";
import { dateInTimeZone } from "@/lib/dates";
import { createClient } from "@/lib/db/server";
import { getEnv } from "@/lib/env";
import type { Range } from "@/lib/range";
import { getAccount, latestMetricDate, loadLatestAudience, loadMetricRows, loadPosts, loadPostWithSnapshots, loadRecentSnapshots, type Db } from "./data";
import { periodEndingOn, type Period } from "./period";
import { computeKpis, dailySeries, latestAnalyticsDate, subscriberSeries, type Kpi, type SeriesPoint, type SubscriberPoint } from "./youtube";
import { buildAudience, buildVideoRows, viewGrowth, type Audience, type GrowthPoint, type VideoRow } from "./youtube-content";

/** YouTube dashboard reads, from the database with the user's session (RLS). */

export type YouTubeAccount = {
  id: string;
  name: string | null;
  handle: string | null;
  status: string;
  lastSyncedAt: string | null;
};

export async function getYouTubeAccount(db?: Db): Promise<YouTubeAccount | null> {
  return getAccount(db ?? (await createClient()), "youtube");
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
  // Analytics arrive late: end the period on the last day with data so both windows are complete.
  const period = periodEndingOn((await latestMetricDate(db, accountId, "views")) ?? today, range);
  const rows = await loadMetricRows(db, accountId, period.previousStart, today);

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
  const posts = await loadPosts(db, accountId);
  if (posts.length === 0) return [];
  return buildVideoRows(posts, await loadRecentSnapshots(db, accountId, COUNTERS));
}

export type YouTubeAudience = Audience & { date: string | null };

export async function getYouTubeAudience(accountId: string): Promise<YouTubeAudience> {
  const { date, records } = await loadLatestAudience(await createClient(), accountId);
  return { date, ...buildAudience(records) };
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
  const found = await loadPostWithSnapshots(await createClient(), postId, "youtube");
  if (!found) return null;
  const { post, snapshots } = found;
  const latestOf = (metric: string) => {
    const rows = snapshots.filter((row) => row.metric === metric);
    return rows.length ? rows[rows.length - 1].value : null;
  };

  return {
    id: post.id,
    title: post.caption ?? "Sin título",
    type: post.type,
    permalink: post.permalink,
    thumbnailUrl: post.thumbnailUrl,
    publishedAt: post.publishedAt,
    durationSeconds: post.durationSeconds,
    growth: viewGrowth(snapshots.filter((row) => row.metric === "viewCount")),
    lifetime: Object.fromEntries(LIFETIME.map((metric) => [metric, latestOf(metric)])) as VideoDetail["lifetime"],
    latest: { views: latestOf("viewCount"), likes: latestOf("likeCount"), comments: latestOf("commentCount") },
  };
}
