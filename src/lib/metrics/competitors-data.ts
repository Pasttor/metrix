import "server-only";
import { addDays } from "@/lib/dates";
import { createClient } from "@/lib/db/server";
import { fail, getAccount, loadMetricRows, loadPosts, loadRecentSnapshots } from "./data";
import { latestValuesByPost } from "./posts";
import { MetricIndex, snapshotOnOrBefore } from "./series";

/** Instagram benchmark: your account next to the competitors, all from the database. */

export type ComparisonRow = {
  id: string | null;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  isOwn: boolean;
  date: string | null;
  followers: number | null;
  followersChange7d: number | null;
  postsLast30d: number | null;
  avgLikes: number | null;
  avgComments: number | null;
  /** (avg likes + avg comments) / followers, in percent. */
  engagement: number | null;
};

const AVERAGE_POSTS = 12;

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function engagementOf(followers: number | null, likes: number | null, comments: number | null) {
  return followers && (likes !== null || comments !== null) ? (((likes ?? 0) + (comments ?? 0)) / followers) * 100 : null;
}

export async function getCompetitorComparison(): Promise<ComparisonRow[]> {
  const db = await createClient();
  const [competitors, own] = await Promise.all([
    db.from("competitors").select("id, username, name, avatar_url").eq("platform", "instagram").order("added_at"),
    getAccount(db, "instagram"),
  ]);
  if (competitors.error) fail("competitors.list", competitors.error);

  const rows: ComparisonRow[] = [];

  if (own) {
    const metrics = new MetricIndex(await loadMetricRows(db, own.id, addDays(new Date().toISOString().slice(0, 10), -40), "9999-12-31"));
    const followerDates = metrics.dates("followers_count");
    const latestDate = followerDates.at(-1) ?? null;
    const followers = latestDate ? metrics.get("followers_count", latestDate) : null;
    const weekAgo = latestDate ? snapshotOnOrBefore(metrics, "followers_count", addDays(latestDate, -7)) : null;

    const posts = (await loadPosts(db, own.id)).filter((post) => post.type !== "story");
    const values = latestValuesByPost(await loadRecentSnapshots(db, own.id, ["like_count", "comments_count"]));
    const recent = posts.slice(0, AVERAGE_POSTS);
    const avgLikes = average(recent.flatMap((post) => (values.get(post.id)?.has("like_count") ? [values.get(post.id)!.get("like_count")!] : [])));
    const avgComments = average(recent.flatMap((post) => (values.get(post.id)?.has("comments_count") ? [values.get(post.id)!.get("comments_count")!] : [])));
    const monthAgo = Date.now() - 30 * 86_400_000;

    rows.push({
      id: null,
      username: own.handle ?? own.name ?? "tú",
      name: "Tú",
      avatarUrl: null,
      isOwn: true,
      date: latestDate,
      followers,
      followersChange7d: followers !== null && weekAgo !== null && followerDates.some((d) => d <= addDays(latestDate!, -7)) ? followers - weekAgo : null,
      postsLast30d: posts.filter((post) => post.publishedAt && Date.parse(post.publishedAt) >= monthAgo).length,
      avgLikes,
      avgComments,
      engagement: engagementOf(followers, avgLikes, avgComments),
    });
  }

  const ids = competitors.data.map((competitor) => competitor.id);
  const { data: snapshots, error } = ids.length
    ? await db
        .from("competitor_snapshots")
        .select("competitor_id, date, metric, value")
        .in("competitor_id", ids)
        .gte("date", addDays(new Date().toISOString().slice(0, 10), -40))
        .order("date")
    : { data: [], error: null };
  if (error) fail("competitor_snapshots.list", error);

  for (const competitor of competitors.data) {
    const index = new MetricIndex(
      (snapshots ?? []).filter((row) => row.competitor_id === competitor.id).map((row) => ({ date: row.date, metric: row.metric, value: Number(row.value) })),
    );
    const date = index.dates("followers_count").at(-1) ?? null;
    const get = (metric: string) => (date ? index.get(metric, date) : null);
    const followers = get("followers_count");
    const hasWeekAgo = date ? index.dates("followers_count").some((d) => d <= addDays(date, -7)) : false;
    const weekAgo = date && hasWeekAgo ? snapshotOnOrBefore(index, "followers_count", addDays(date, -7)) : null;
    rows.push({
      id: competitor.id,
      username: competitor.username,
      name: competitor.name,
      avatarUrl: competitor.avatar_url,
      isOwn: false,
      date,
      followers,
      followersChange7d: followers !== null && weekAgo !== null ? followers - weekAgo : null,
      postsLast30d: get("posts_last_30d"),
      avgLikes: get("avg_likes_recent"),
      avgComments: get("avg_comments_recent"),
      engagement: get("engagement_rate_recent"),
    });
  }
  return rows;
}
