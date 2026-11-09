import "server-only";
import { dateInTimeZone } from "@/lib/dates";
import { createClient } from "@/lib/db/server";
import { getEnv } from "@/lib/env";
import type { AccountPlatform } from "@/lib/oauth/types";
import type { Range } from "@/lib/range";
import { fail, getAccount, loadMetricRows, loadPosts, loadRecentSnapshots, type Db } from "./data";
import { periodEndingOn, type Period } from "./period";
import { latestValuesByPost, postTitle } from "./posts";
import { MetricIndex, type SeriesPoint } from "./series";
import {
  buildUnifiedMap,
  engagementRate,
  followerTrend,
  postingHeatmap,
  summarizeNetwork,
  trendWindow,
  unifyAccountRows,
  unifyPostValues,
  type HeatmapCell,
  type HeatmapPost,
  type NetworkSummary,
} from "./unified";

/** The unified overview (`/`), from the database with the user's session. */

export const NETWORKS: { platform: AccountPlatform; label: string; detail: (postId: string) => string | null }[] = [
  { platform: "youtube", label: "YouTube", detail: (id) => `/youtube/videos/${id}` },
  { platform: "instagram", label: "Instagram", detail: (id) => `/instagram/posts/${id}` },
  { platform: "facebook", label: "Facebook", detail: (id) => `/facebook/posts/${id}` },
  { platform: "tiktok", label: "TikTok", detail: () => null },
];

/** Posts with fewer views are left out of the engagement ranking (a 1-view post at 100 % says nothing). */
export const MIN_VIEWS_FOR_ENGAGEMENT = 50;

export type NetworkOverview =
  | { platform: AccountPlatform; label: string; connected: false }
  | { platform: AccountPlatform; label: string; connected: true; name: string | null; period: Period; summary: NetworkSummary; followers: SeriesPoint[] };

export type OverviewPost = {
  id: string;
  platform: AccountPlatform;
  network: string;
  title: string;
  type: string;
  publishedAt: string | null;
  views: number | null;
  engagement: number | null;
  href: string | null;
};

export type Overview = {
  networks: NetworkOverview[];
  topByViews: OverviewPost[];
  topByEngagement: OverviewPost[];
  heatmap: { all: HeatmapCell[] | null; byNetwork: Record<string, HeatmapCell[] | null>; posts: number };
};

/** `client`: the MCP server passes its service client; the dashboard reads with the session. */
export async function getOverview(range: Range, client?: Db): Promise<Overview> {
  const db = client ?? (await createClient());
  const timeZone = getEnv().REPORT_TIMEZONE;
  const today = dateInTimeZone(new Date(), timeZone);

  const { data: catalog, error } = await db.from("metric_catalog").select("platform, scope, metric, unified_metric");
  if (error) fail("metric_catalog.list", error);
  const map = buildUnifiedMap(catalog.map((row) => ({ platform: row.platform, scope: row.scope, metric: row.metric, unifiedMetric: row.unified_metric })));

  const networks: NetworkOverview[] = [];
  const posts: OverviewPost[] = [];
  const heatmapPosts: HeatmapPost[] = [];
  const window = trendWindow(today, range);

  for (const network of NETWORKS) {
    const account = await getAccount(db, network.platform);
    if (!account) {
      networks.push({ platform: network.platform, label: network.label, connected: false });
      continue;
    }

    // Two full periods back (for the comparison), plus the followers window.
    const rawRows = await loadMetricRows(db, account.id, periodEndingOn(today, range * 2 + 3).start, today);
    const unified = unifyAccountRows(rawRows, network.platform, map);
    // Daily insights arrive late: each network's period ends on its own last day with views.
    const lastViews = new MetricIndex(unified).dates("views").at(-1);
    const period = periodEndingOn(lastViews ?? today, range);
    networks.push({
      platform: network.platform,
      label: network.label,
      connected: true,
      name: account.handle ? `@${account.handle}` : account.name,
      period,
      summary: summarizeNetwork(unified, period),
      followers: followerTrend(unified, window.from, window.to),
    });

    const postMetrics = [...(map.get(network.platform)?.get("post")?.keys() ?? [])];
    const values = latestValuesByPost(await loadRecentSnapshots(db, account.id, postMetrics));
    for (const post of await loadPosts(db, account.id)) {
      if (post.type === "story") continue;
      const v = unifyPostValues(values.get(post.id), network.platform, map);
      const views = v.get("views") ?? null;
      const engagement = engagementRate({
        interactions: v.get("interactions"),
        likes: v.get("likes"),
        comments: v.get("comments"),
        shares: v.get("shares"),
        views,
      });
      posts.push({
        id: post.id,
        platform: network.platform,
        network: network.label,
        title: postTitle(post),
        type: post.type,
        publishedAt: post.publishedAt,
        views,
        engagement,
        href: network.detail(post.id),
      });
      if (post.publishedAt && engagement !== null) heatmapPosts.push({ network: network.platform, publishedAt: post.publishedAt, engagement });
    }
  }

  const byViews = posts.filter((post) => post.views !== null).sort((a, b) => b.views! - a.views!);
  const byEngagement = posts
    .filter((post) => post.engagement !== null && (post.views ?? 0) >= MIN_VIEWS_FOR_ENGAGEMENT)
    .sort((a, b) => b.engagement! - a.engagement!);

  return {
    networks,
    topByViews: byViews.slice(0, 10),
    topByEngagement: byEngagement.slice(0, 10),
    heatmap: {
      all: postingHeatmap(heatmapPosts, timeZone),
      byNetwork: Object.fromEntries(
        NETWORKS.map((network) => [network.platform, postingHeatmap(heatmapPosts.filter((post) => post.network === network.platform), timeZone)]),
      ),
      posts: heatmapPosts.length,
    },
  };
}
