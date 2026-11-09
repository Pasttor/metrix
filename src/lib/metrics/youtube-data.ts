import "server-only";
import { dateInTimeZone } from "@/lib/dates";
import { createClient } from "@/lib/db/server";
import { getEnv } from "@/lib/env";
import type { Range } from "@/lib/range";
import {
  getAccount,
  latestMetricDate,
  loadLatestAudience,
  loadMetricRows,
  loadPostAudience,
  loadPostDaily,
  loadPosts,
  loadPostWithSnapshots,
  loadRecentSnapshots,
  type Db,
} from "./data";
import { periodEndingOn, type Period } from "./period";
import { breakdownShares, type BreakdownShare } from "./series";
import { computeKpis, dailySeries, latestAnalyticsDate, subscriberSeries, type Kpi, type SeriesPoint, type SubscriberPoint } from "./youtube";
import {
  buildAudience,
  buildVideoRows,
  viewGrowth,
  type Audience,
  type AudienceRecord,
  type GrowthPoint,
  type ShareRow,
  type VideoRow,
} from "./youtube-content";

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

const CONTENT_TYPE_LABELS: Record<string, string> = {
  shorts: "Shorts",
  videoOnDemand: "Videos",
  liveStream: "Directos",
  story: "Historias",
};

export type YouTubeOverview = {
  period: Period;
  kpis: Kpi[];
  views: SeriesPoint[];
  engagedViews: SeriesPoint[];
  /** Views of the period by content type (Shorts, videos, lives). */
  contentTypes: BreakdownShare[];
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
    engagedViews: dailySeries(rows, "engagedViews", period),
    contentTypes: breakdownShares(rows, "views", "content_type", period.start, period.end, CONTENT_TYPE_LABELS),
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
  /** Daily Analytics series since publication (weekly refresh). */
  daily: { views: SeriesPoint[]; engagedViews: SeriesPoint[]; subscribersGained: number | null };
  /** Lifetime breakdowns of the video as of `audienceDate`. */
  audience: Audience & { searchTerms: ShareRow[] };
  audienceDate: string | null;
};

const LIFETIME = ["estimatedMinutesWatched", "averageViewDuration", "averageViewPercentage"] as const;

function searchTermRows(records: AudienceRecord[]): ShareRow[] {
  const terms = records.filter((record) => record.dimension === "search_term");
  const total = terms.reduce((sum, record) => sum + record.value, 0);
  return terms
    .map((record) => ({ key: record.key, label: record.key, value: record.value, share: total ? record.value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}

export async function getVideoDetail(postId: string): Promise<VideoDetail | null> {
  const db = await createClient();
  const found = await loadPostWithSnapshots(db, postId, "youtube");
  if (!found) return null;
  const { post, snapshots } = found;
  const [dailyRows, postAudience] = await Promise.all([loadPostDaily(db, postId), loadPostAudience(db, postId)]);
  const first = dailyRows[0]?.date;
  const last = dailyRows.at(-1)?.date;
  const range = first && last ? { start: first, end: last } : null;
  const subscribers = dailyRows.filter((row) => row.metric === "subscribersGained");
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
    daily: {
      views: range ? dailySeries(dailyRows, "views", range) : [],
      engagedViews: range ? dailySeries(dailyRows, "engagedViews", range) : [],
      subscribersGained: subscribers.length ? subscribers.reduce((sum, row) => sum + row.value, 0) : null,
    },
    audience: { ...buildAudience(postAudience.records), searchTerms: searchTermRows(postAudience.records) },
    audienceDate: postAudience.date,
  };
}
