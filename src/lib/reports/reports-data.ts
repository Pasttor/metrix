import "server-only";
import { addDays } from "@/lib/dates";
import { createClient } from "@/lib/db/server";
import { getAccount, loadPosts, loadRecentSnapshots, selectAll, type Db } from "@/lib/metrics/data";
import { latestValuesByPost, postTitle } from "@/lib/metrics/posts";
import type { PostRecord } from "@/lib/metrics/youtube-content";
import {
  aggregateSearchTerms,
  hookFromSkipRate,
  matchAcrossNetworks,
  retentionAt,
  searchShare,
  type CrossGroup,
  type ReportPost,
  type RetentionPoint,
  type SearchTermRow,
} from "./analysis";

/** Data for /reportes, read from the database with the user's session. */

const METRICS = {
  youtube: ["viewCount", "likeCount", "commentCount", "averageViewDuration"],
  instagram: ["views", "total_interactions", "like_count", "comments_count", "ig_reels_avg_watch_time", "reels_skip_rate"],
  facebook: ["post_media_view", "reactions", "comments", "shares", "post_video_avg_time_watched"],
  tiktok: ["view_count", "like_count", "comment_count", "share_count"],
} as const;

const DETAIL = {
  youtube: (id: string) => `/youtube/videos/${id}`,
  instagram: (id: string) => `/instagram/posts/${id}`,
  facebook: (id: string) => `/facebook/posts/${id}`,
  tiktok: (id: string) => `/tiktok/videos/${id}`,
};

function retentionOf(raw: unknown): RetentionPoint[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const points = (raw as { retention?: { points?: unknown } }).retention?.points;
  if (!Array.isArray(points)) return [];
  return points.flatMap((point) =>
    point && typeof point.ratio === "number" && typeof point.audienceWatchRatio === "number" ? [{ ratio: point.ratio, audienceWatchRatio: point.audienceWatchRatio }] : [],
  );
}

async function loadRaw(db: Db, accountId: string): Promise<Map<string, unknown>> {
  const rows = await selectAll("posts.raw", (from, to) => db.from("posts").select("id, raw").eq("account_id", accountId).order("id").range(from, to));
  return new Map(rows.map((row) => [row.id, row.raw]));
}

const ratio = (part: number | null, whole: number | null) => (part === null || !whole ? null : (part / whole) * 100);
const sumKnown = (...values: (number | null | undefined)[]) => {
  const known = values.filter((value): value is number => typeof value === "number");
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
};

function toReportPost(platform: ReportPost["platform"], post: PostRecord, values: Map<string, number> | undefined, raw: unknown): ReportPost {
  const get = (metric: string) => values?.get(metric) ?? null;
  const curve = retentionOf(raw);
  const base = { id: post.id, platform, title: postTitle(post), caption: post.caption, publishedAt: post.publishedAt, durationSeconds: post.durationSeconds, href: DETAIL[platform](post.id) };
  if (platform === "youtube") {
    const views = get("viewCount");
    return { ...base, views, engagement: ratio(sumKnown(get("likeCount"), get("commentCount")), views), avgWatchSeconds: get("averageViewDuration"), hook3s: retentionAt(curve, post.durationSeconds) };
  }
  if (platform === "instagram") {
    const views = get("views");
    const avg = get("ig_reels_avg_watch_time");
    return {
      ...base,
      views,
      engagement: ratio(get("total_interactions") ?? sumKnown(get("like_count"), get("comments_count")), views),
      avgWatchSeconds: avg === null ? null : avg / 1000,
      hook3s: hookFromSkipRate(get("reels_skip_rate")),
    };
  }
  if (platform === "tiktok") {
    // TikTok gives neither watch time nor retention for personal accounts.
    const views = get("view_count");
    return { ...base, views, engagement: ratio(sumKnown(get("like_count"), get("comment_count"), get("share_count")), views), avgWatchSeconds: null, hook3s: null };
  }
  const views = get("post_media_view");
  const avg = get("post_video_avg_time_watched");
  return {
    ...base,
    views,
    engagement: ratio(sumKnown(get("reactions"), get("comments"), get("shares")), views),
    avgWatchSeconds: avg === null ? null : avg / 1000,
    hook3s: retentionAt(curve, post.durationSeconds),
  };
}

export type SeoVideo = { id: string; title: string; href: string; searchShare: number | null; terms: { term: string; views: number }[] };

export type Reports = {
  posts: ReportPost[];
  groups: CrossGroup[];
  seo: { terms: SearchTermRow[]; videos: SeoVideo[] };
};

/** `client`: the MCP server passes its service client; the dashboard reads with the session. */
export async function getReports(client?: Db): Promise<Reports> {
  const db = client ?? (await createClient());
  const posts: ReportPost[] = [];
  let youtubeAccountId: string | null = null;

  for (const platform of ["youtube", "instagram", "facebook", "tiktok"] as const) {
    const account = await getAccount(db, platform);
    if (!account) continue;
    if (platform === "youtube") youtubeAccountId = account.id;
    const [records, snapshots, raw] = await Promise.all([loadPosts(db, account.id), loadRecentSnapshots(db, account.id, [...METRICS[platform]]), loadRaw(db, account.id)]);
    const values = latestValuesByPost(snapshots);
    for (const record of records) {
      if (record.type === "story") continue;
      posts.push(toReportPost(platform, record, values.get(record.id), raw.get(record.id)));
    }
  }

  const videos: SeoVideo[] = [];
  if (youtubeAccountId) {
    const youtubePosts = posts.filter((post) => post.platform === "youtube");
    const ids = youtubePosts.map((post) => post.id);
    const rows = ids.length
      ? await selectAll("post_audience_snapshots.seo", (from, to) =>
          db
            .from("post_audience_snapshots")
            .select("post_id, captured_on, dimension, key, value")
            .in("post_id", ids)
            .in("dimension", ["search_term", "traffic_source"])
            .gte("captured_on", addDays(new Date().toISOString().slice(0, 10), -60))
            .order("captured_on")
            .order("post_id")
            .order("key")
            .range(from, to),
        )
      : [];
    for (const post of youtubePosts) {
      const own = rows.filter((row) => row.post_id === post.id);
      const latest = own.reduce<string | null>((max, row) => (max === null || row.captured_on > max ? row.captured_on : max), null);
      const current = own.filter((row) => row.captured_on === latest);
      videos.push({
        id: post.id,
        title: post.title,
        href: post.href,
        searchShare: searchShare(current.filter((row) => row.dimension === "traffic_source").map((row) => ({ key: row.key, value: Number(row.value) }))),
        terms: current
          .filter((row) => row.dimension === "search_term")
          .map((row) => ({ term: row.key, views: Number(row.value) }))
          .sort((a, b) => b.views - a.views),
      });
    }
  }
  return {
    posts,
    groups: matchAcrossNetworks(posts),
    seo: { terms: aggregateSearchTerms(videos.map((video) => ({ title: video.title, terms: video.terms }))), videos },
  };
}
