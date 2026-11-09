import "server-only";
import { addDays, dateInTimeZone } from "@/lib/dates";
import { createClient } from "@/lib/db/server";
import { getEnv } from "@/lib/env";
import type { Range } from "@/lib/range";
import { getAccount, latestMetricDate, loadMetricRows, loadPosts, loadPostWithSnapshots, selectAll, type DashboardAccount } from "./data";
import { periodEndingOn, type Period } from "./period";
import { latestValuesByPost, percentOf, postTitle, type PostTableRow } from "./posts";
import { dailySeries, type SeriesPoint } from "./series";
import { computeTikTokKpis, videoGain, type VideoSnapshot } from "./tiktok";
import type { Kpi } from "./youtube";
import { viewGrowth, type GrowthPoint } from "./youtube-content";

/** TikTok dashboard reads, from the database with the user's session (RLS). */

const COUNTERS = ["view_count", "like_count", "comment_count", "share_count"];

export type TikTokDashboard = {
  account: DashboardAccount;
  period: Period;
  kpis: Kpi[];
  followers: SeriesPoint[];
  likes: SeriesPoint[];
  videos: PostTableRow[];
  snapshotDays: number;
};

export async function getTikTokDashboard(range: Range): Promise<TikTokDashboard | null> {
  const db = await createClient();
  const account = await getAccount(db, "tiktok");
  if (!account) return null;

  const today = dateInTimeZone(new Date(), getEnv().REPORT_TIMEZONE);
  // Snapshots are taken daily with no lag: the period ends on the last snapshot.
  const period = periodEndingOn((await latestMetricDate(db, account.id, "follower_count")) ?? today, range);
  const from = addDays(period.previousStart, -14);
  const [rows, posts] = await Promise.all([loadMetricRows(db, account.id, from, today), loadPosts(db, account.id)]);

  const ids = posts.map((post) => post.id);
  const snapshots: VideoSnapshot[] = ids.length
    ? (
        await selectAll("post_metric_snapshots.tiktok", (start, end) =>
          db
            .from("post_metric_snapshots")
            .select("post_id, captured_on, metric, value")
            .in("post_id", ids)
            .in("metric", COUNTERS)
            .gte("captured_on", from)
            .order("captured_on")
            .order("post_id")
            .order("metric")
            .range(start, end),
        )
      ).map((row) => ({ postId: row.post_id, capturedOn: row.captured_on, metric: row.metric, value: Number(row.value) }))
    : [];
  const byPost = new Map<string, VideoSnapshot[]>();
  for (const snapshot of snapshots) byPost.set(snapshot.postId, [...(byPost.get(snapshot.postId) ?? []), snapshot]);
  const latest = latestValuesByPost(snapshots);

  return {
    account,
    period,
    kpis: computeTikTokKpis(
      rows,
      posts.map((post) => ({ publishedAt: post.publishedAt, rows: byPost.get(post.id) ?? [] })),
      period,
    ),
    followers: dailySeries(rows, "follower_count", { start: period.start, end: today }),
    likes: dailySeries(rows, "likes_count", { start: period.start, end: today }),
    snapshotDays: new Set(rows.filter((row) => row.metric === "follower_count").map((row) => row.date)).size,
    videos: posts.map((post) => {
      const v = latest.get(post.id);
      const get = (metric: string) => v?.get(metric) ?? null;
      const views = get("view_count");
      const interactions = [get("like_count"), get("comment_count"), get("share_count")].filter((n): n is number => n !== null);
      return {
        id: post.id,
        title: postTitle(post),
        type: "video",
        subtitle: post.durationSeconds ? `Video · ${Math.floor(post.durationSeconds / 60)}:${String(post.durationSeconds % 60).padStart(2, "0")}` : "Video",
        thumbnailUrl: post.thumbnailUrl,
        publishedAt: post.publishedAt,
        href: `/tiktok/videos/${post.id}`,
        external: false,
        values: {
          views,
          likes: get("like_count"),
          comments: get("comment_count"),
          shares: get("share_count"),
          engagement: interactions.length ? percentOf(interactions.reduce((a, b) => a + b, 0), views) : null,
          gained: videoGain(byPost.get(post.id) ?? [], post.publishedAt, period.start, period.end),
        },
      };
    }),
  };
}

export type TikTokVideoDetail = {
  id: string;
  title: string;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  latest: Record<string, number | null>;
  growth: GrowthPoint[];
};

export async function getTikTokVideoDetail(postId: string): Promise<TikTokVideoDetail | null> {
  const found = await loadPostWithSnapshots(await createClient(), postId, "tiktok");
  if (!found) return null;
  const { post, snapshots } = found;
  const latest = latestValuesByPost(snapshots).get(post.id) ?? new Map<string, number>();
  return {
    id: post.id,
    title: postTitle(post),
    caption: post.caption,
    permalink: post.permalink,
    thumbnailUrl: post.thumbnailUrl,
    publishedAt: post.publishedAt,
    durationSeconds: post.durationSeconds,
    latest: Object.fromEntries(latest),
    growth: viewGrowth(snapshots.filter((row) => row.metric === "view_count")),
  };
}
