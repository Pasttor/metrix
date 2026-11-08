import "server-only";
import { addDays, dateInTimeZone } from "@/lib/dates";
import { createClient } from "@/lib/db/server";
import { getEnv } from "@/lib/env";
import type { Range } from "@/lib/range";
import { getAccount, latestMetricDate, loadLatestAudience, loadMetricRows, loadPosts, loadPostWithSnapshots, loadRecentSnapshots, type DashboardAccount } from "./data";
import { buildFollowerDemographics, computeFacebookKpis, computeInstagramKpis, followerSeries, type FollowerDemographics } from "./meta";
import { periodEndingOn, type Period } from "./period";
import { latestValuesByPost, percentOf, postTitle, type PostTableRow } from "./posts";
import { dailySeries, type SeriesPoint } from "./series";
import type { Kpi } from "./youtube";
import { viewGrowth, type GrowthPoint } from "./youtube-content";

/** Instagram and Facebook dashboard reads, from the database with the user's session (RLS). */

export const IG_TYPE_LABELS: Record<string, string> = {
  reel: "Reel",
  carousel: "Carrusel",
  image: "Imagen",
  video: "Video",
  story: "Historia",
};
export const FB_TYPE_LABELS: Record<string, string> = { reel: "Reel", video: "Video", image: "Foto", carousel: "Álbum", post: "Publicación" };

const IG_POST_METRICS = ["views", "reach", "likes", "comments", "saved", "shares", "total_interactions"];
const FB_POST_METRICS = ["post_media_view", "post_total_media_view_unique", "reactions", "comments", "shares", "post_clicks", "post_video_views"];

export type MetaDashboard = {
  account: DashboardAccount;
  period: Period;
  kpis: Kpi[];
  followers: SeriesPoint[];
  charts: { views: SeriesPoint[]; secondary: SeriesPoint[] };
  posts: PostTableRow[];
  hasData: boolean;
};

export type InstagramDashboard = MetaDashboard & { demographics: FollowerDemographics; audienceDate: string | null; historyStart: string };

async function loadOverview(accountId: string, anchorMetric: string, range: Range) {
  const db = await createClient();
  const today = dateInTimeZone(new Date(), getEnv().REPORT_TIMEZONE);
  // Daily insights arrive up to 48 h late: end the period on the last day with data.
  const period = periodEndingOn((await latestMetricDate(db, accountId, anchorMetric)) ?? today, range);
  const rows = await loadMetricRows(db, accountId, period.previousStart, today);
  return { db, today, period, rows };
}

export async function getInstagramDashboard(range: Range): Promise<InstagramDashboard | null> {
  const account = await getAccount(await createClient(), "instagram");
  if (!account) return null;
  const { db, today, period, rows } = await loadOverview(account.id, "views", range);
  const [posts, audience] = await Promise.all([loadPosts(db, account.id), loadLatestAudience(db, account.id)]);
  const values = latestValuesByPost(await loadRecentSnapshots(db, account.id, IG_POST_METRICS));

  return {
    account,
    period,
    kpis: computeInstagramKpis(rows, period),
    followers: followerSeries(rows, period.start, today),
    charts: { views: dailySeries(rows, "views", period), secondary: dailySeries(rows, "reach", period) },
    posts: posts.map((post) => {
      const v = values.get(post.id);
      const get = (metric: string) => v?.get(metric) ?? null;
      return {
        id: post.id,
        title: postTitle(post),
        type: post.type,
        subtitle: IG_TYPE_LABELS[post.type] ?? post.type,
        thumbnailUrl: post.thumbnailUrl,
        publishedAt: post.publishedAt,
        href: `/instagram/posts/${post.id}`,
        external: false,
        values: {
          views: get("views"),
          reach: get("reach"),
          likes: get("likes"),
          comments: get("comments"),
          saved: get("saved"),
          shares: get("shares"),
          engagement: percentOf(get("total_interactions"), get("reach")),
        },
      };
    }),
    demographics: buildFollowerDemographics(audience.records),
    audienceDate: audience.date,
    // Instagram keeps 90 days of account insights before the connection date.
    historyStart: addDays(dateInTimeZone(new Date(account.connectedAt), getEnv().REPORT_TIMEZONE), -90),
    hasData: rows.length > 0 || posts.length > 0,
  };
}

export async function getFacebookDashboard(range: Range): Promise<MetaDashboard | null> {
  const account = await getAccount(await createClient(), "facebook");
  if (!account) return null;
  const { db, today, period, rows } = await loadOverview(account.id, "page_total_media_view_unique", range);
  const posts = await loadPosts(db, account.id);
  const values = latestValuesByPost(await loadRecentSnapshots(db, account.id, FB_POST_METRICS));

  return {
    account,
    period,
    kpis: computeFacebookKpis(rows, period),
    followers: followerSeries(rows, period.start, today),
    charts: { views: dailySeries(rows, "page_total_media_view_unique", period), secondary: dailySeries(rows, "page_video_views", period) },
    posts: posts.map((post) => {
      const v = values.get(post.id);
      const get = (metric: string) => v?.get(metric) ?? null;
      return {
        id: post.id,
        title: postTitle(post),
        type: post.type,
        subtitle: FB_TYPE_LABELS[post.type] ?? post.type,
        thumbnailUrl: post.thumbnailUrl,
        publishedAt: post.publishedAt,
        // Facebook posts open on Facebook; the table already shows every metric.
        href: post.permalink,
        external: true,
        values: Object.fromEntries(FB_POST_METRICS.map((metric) => [metric, get(metric)])),
      };
    }),
    hasData: rows.length > 0 || posts.length > 0,
  };
}

export type InstagramPostDetail = {
  id: string;
  title: string;
  caption: string | null;
  type: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  latest: Record<string, number | null>;
  growth: GrowthPoint[];
};

export async function getInstagramPostDetail(postId: string): Promise<InstagramPostDetail | null> {
  const found = await loadPostWithSnapshots(await createClient(), postId, "instagram");
  if (!found) return null;
  const { post, snapshots } = found;
  const latest = latestValuesByPost(snapshots).get(post.id) ?? new Map<string, number>();
  return {
    id: post.id,
    title: postTitle(post),
    caption: post.caption,
    type: post.type,
    permalink: post.permalink,
    thumbnailUrl: post.thumbnailUrl,
    publishedAt: post.publishedAt,
    latest: Object.fromEntries(latest),
    growth: viewGrowth(snapshots.filter((row) => row.metric === "views")),
  };
}
