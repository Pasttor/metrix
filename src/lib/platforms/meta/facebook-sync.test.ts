import { describe, expect, it, vi } from "vitest";
import invalidMetric from "../../../../tests/fixtures/meta/error-invalid-metric.json";
import tokenExpired from "../../../../tests/fixtures/meta/error-token-expired.json";
import page from "../../../../tests/fixtures/meta/fb-page.json";
import pageInsights from "../../../../tests/fixtures/meta/fb-page-insights-3days.json";
import postInsights from "../../../../tests/fixtures/meta/fb-post-insights-video.json";
import posts from "../../../../tests/fixtures/meta/fb-published-posts.json";
import videoDetails from "../../../../tests/fixtures/meta/fb-video-details.json";
import type { Json } from "@/lib/db/types";
import { ReauthRequiredError } from "@/lib/oauth/token-store";
import type { MetricsStore, PostUpsert } from "@/lib/sync/metrics-store";
import type { AccountSyncInput, SyncAccount } from "@/lib/sync/types";
import { fbPostType, pageDailyRows, postInsightRows, retentionFromGraph } from "./facebook-parsers";
import { createFacebookSyncer, FB_BLOCK_DAYS } from "./facebook-sync";
import { fbPostSchema, insightsSchema } from "./schemas";

const SUNDAY = new Date("2026-11-08T18:00:00Z");
const MONDAY = new Date("2026-11-09T18:00:00Z");
const FB: SyncAccount = { id: "acc-fb", platform: "facebook", externalId: "1000000000000001", name: "Casiquiebra" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Options = { retired?: string[]; authError?: boolean; activeBlocks?: number };

/** Page insights: real values for the last `activeBlocks` 90-day blocks, zeros before that. */
function fakeGraph(options: Options = {}) {
  const calls: URL[] = [];
  const fetch = async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url);
    const params = url.searchParams;
    const path = url.pathname.replace("/v26.0/", "");
    if (options.authError) return json(tokenExpired, 400);
    if (path === FB.externalId) return json(page);
    if (path === `${FB.externalId}/published_posts`) return json(posts);
    if (path === `${FB.externalId}/insights`) {
      const metrics = params.get("metric")!.split(",");
      if (metrics.some((metric) => options.retired?.includes(metric))) return json(invalidMetric, 400);
      const since = Number(params.get("since")) * 1000;
      const until = Number(params.get("until")) * 1000;
      const blockAge = Math.floor((SUNDAY.getTime() - until) / (FB_BLOCK_DAYS * 86_400_000));
      const active = blockAge < (options.activeBlocks ?? 1);
      // One value per day in [since, until), end_time = end of that day.
      const data = metrics.map((name) => {
        const values = [];
        for (let t = since + 86_400_000; t <= until; t += 86_400_000) values.push({ value: active ? 5 : 0, end_time: new Date(t).toISOString() });
        return { name, period: "day", values };
      });
      return json(params.get("since") && until - since <= 4 * 86_400_000 ? { data: pageInsights.data.filter((d) => metrics.includes(d.name)) } : { data });
    }
    if (path === "3001") return json(videoDetails);
    if (path.endsWith("/insights")) return json({ data: postInsights.data.filter((d) => params.get("metric")!.split(",").includes(d.name)) });
    throw new Error(`unexpected fetch ${path}`);
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

function memoryStore() {
  const accountMetrics = new Map<string, number>();
  const posts = new Map<string, PostUpsert>();
  const postMetrics = new Map<string, number>();
  const deprecated: string[] = [];
  const details = new Map<string, { durationSeconds?: number | null; retention?: { points: { ratio: number; audienceWatchRatio: number }[] } }>();
  const store: MetricsStore = {
    async upsertAccountMetrics(_id, rows) {
      for (const row of rows) accountMetrics.set(`${row.date}|${row.metric}`, row.value);
      return rows.length;
    },
    async upsertPosts(_id, items) {
      const ids = new Map<string, string>();
      for (const post of items) {
        posts.set(post.externalId, post);
        ids.set(post.externalId, `post-${post.externalId}`);
      }
      return ids;
    },
    async upsertPostMetrics(capturedOn, rows) {
      for (const row of rows) postMetrics.set(`${row.postId}|${capturedOn}|${row.metric}`, row.value);
      return rows.length;
    },
    async upsertAudience() {
      return 0;
    },
    async listPostsSince() {
      return [];
    },
    async savePostDetails(postId, value) {
      details.set(postId, value);
    },
    async markMetricDeprecated(platform, scope, metric) {
      deprecated.push(`${platform}/${scope}/${metric}`);
    },
  };
  return { store, accountMetrics, posts, postMetrics, deprecated, details };
}

function setup(options: Options = {}) {
  const graph = fakeGraph(options);
  const memory = memoryStore();
  const markReauthRequired = vi.fn(async () => undefined);
  const syncer = createFacebookSyncer({
    getAccessToken: async () => "EAApage",
    markReauthRequired,
    store: memory.store,
    version: "v26.0",
    reportTimeZone: "America/Mexico_City",
    fetch: graph.fetch,
    retry: { sleep: async () => undefined },
  });
  const run = (input: Partial<AccountSyncInput> = {}) =>
    syncer.syncAccount({ account: FB, job: "daily", cursor: null, shouldStop: () => false, now: SUNDAY, ...input });
  return { ...graph, ...memory, markReauthRequired, run };
}

const pageInsightCalls = (calls: URL[]) => calls.filter((url) => url.pathname.endsWith(`${FB.externalId}/insights`));

describe("Facebook daily sync", () => {
  it("snapshots followers, saves the last 3 Page days and each post with its counters and insights", async () => {
    const t = setup();
    const result = await t.run();
    expect(result).toMatchObject({ done: true, warnings: [] });

    expect(t.accountMetrics.get("2026-11-08|followers_count")).toBe(0); // a real zero from the API
    const [call] = pageInsightCalls(t.calls);
    expect(call.searchParams.get("metric")).toBe(
      "page_follows,page_total_media_view_unique,page_post_engagements,page_video_views,page_media_view,page_video_view_time,page_video_complete_views_30s,page_daily_follows_unique,page_daily_unfollows_unique",
    );
    // end_time marks the end of the day: 2026-11-06T08:00Z → 2026-11-05.
    expect(t.accountMetrics.get("2026-11-05|page_total_media_view_unique")).toBe(288);
    expect(t.accountMetrics.get("2026-11-07|page_media_view")).toBe(107);

    expect([...t.posts.values()].map((post) => [post.externalId, post.type])).toEqual([
      ["1000000000000001_2001", "reel"],
      ["1000000000000001_2002", "video"],
      ["1000000000000001_2003", "image"],
    ]);
    expect(t.postMetrics.get("post-1000000000000001_2002|2026-11-08|shares")).toBe(2);
    // Meta omits `shares` when nobody shared: not written as 0.
    expect(t.postMetrics.has("post-1000000000000001_2001|2026-11-08|shares")).toBe(false);
    expect(t.postMetrics.get("post-1000000000000001_2002|2026-11-08|post_video_avg_time_watched")).toBe(7573);
    expect(t.postMetrics.get("post-1000000000000001_2002|2026-11-08|post_reactions_by_type_total.like")).toBe(1);
    // Daily: no insights for posts older than 30 days.
    expect(t.calls.some((url) => url.pathname.includes("_2003/insights"))).toBe(false);
  });

  it("saves video length, Reels plays and the retention curve from one call per video", async () => {
    const t = setup();
    await t.run();
    const videoCall = t.calls.find((url) => url.pathname.endsWith("/3001"))!;
    expect(videoCall.searchParams.get("fields")).toBe(
      "length,video_insights.metric(blue_reels_play_count,fb_reels_total_plays,fb_reels_replay_count,post_video_retention_graph)",
    );
    expect(t.postMetrics.get("post-1000000000000001_2002|2026-11-08|fb_reels_total_plays")).toBe(244);
    expect(t.postMetrics.get("post-1000000000000001_2002|2026-11-08|fb_reels_replay_count")).toBe(22);
    expect(t.postMetrics.has("post-1000000000000001_2002|2026-11-08|post_video_retention_graph")).toBe(false);
    const saved = t.details.get("post-1000000000000001_2002")!;
    expect(saved.durationSeconds).toBe(44);
    expect(saved.retention?.points).toHaveLength(41);
    expect(saved.retention?.points[4]).toEqual({ ratio: 0.1, audienceWatchRatio: 0.5217, relativePerformance: null });
    // Posts are upserted without a duration so the stored length is not reset.
    expect(t.posts.get("1000000000000001_2002")?.durationSeconds).toBeUndefined();
  });

  it("refreshes insights of every post on Mondays", async () => {
    const t = setup();
    await t.run({ now: MONDAY });
    const photoCall = t.calls.find((url) => url.pathname.includes("_2003/insights"))!;
    expect(photoCall.searchParams.get("metric")).not.toContain("post_video_views");
    expect(photoCall.searchParams.get("period")).toBe("lifetime");
  });

  it("flags a metric Meta retired in metric_catalog and keeps the others", async () => {
    const t = setup({ retired: ["page_video_views"] });
    const result = await t.run();
    expect(result.warnings).toEqual(["página: métrica page_video_views retirada por Meta"]);
    expect(t.deprecated).toEqual(["facebook/account/page_video_views"]);
    expect(t.accountMetrics.get("2026-11-05|page_follows")).toBe(0);
    expect(t.accountMetrics.has("2026-11-05|page_video_views")).toBe(false);
  });

  it("marks the Page for reconnection when Meta rejects the token", async () => {
    const t = setup({ authError: true });
    await expect(t.run()).rejects.toBeInstanceOf(ReauthRequiredError);
    expect(t.markReauthRequired).toHaveBeenCalledWith("acc-fb");
  });
});

describe("Facebook backfill", () => {
  it("walks back in 89-day blocks and stops at the first block without data", async () => {
    const t = setup({ activeBlocks: 2 });
    const result = await t.run({ job: "backfill" });
    expect(result.done).toBe(true);
    const blocks = pageInsightCalls(t.calls);
    expect(blocks).toHaveLength(3); // two with data, the third all zeros ends it
    for (const block of blocks) {
      const span = (Number(block.searchParams.get("until")) - Number(block.searchParams.get("since"))) / 86_400;
      expect(span).toBeLessThan(90); // Meta rejects more than 90 days, DST hour included
    }
    expect(t.accountMetrics.get("2026-11-07|page_follows")).toBe(5);
    expect(t.accountMetrics.size).toBe(2 * FB_BLOCK_DAYS * 9 + 1);
  });

  it("stops between blocks with a cursor and resumes from it", async () => {
    const t = setup({ activeBlocks: 3 });
    const first = await t.run({ job: "backfill", shouldStop: () => pageInsightCalls(t.calls).length >= 1 });
    expect(first).toMatchObject({ done: false, cursor: { step: "page", before: "2026-08-10" } });

    const resumed = setup({ activeBlocks: 3 });
    await resumed.run({ job: "backfill", cursor: first.cursor as Json });
    const [firstBlock] = pageInsightCalls(resumed.calls);
    expect(firstBlock.searchParams.get("until")).toBe(String(Date.parse("2026-08-11T07:00:00Z") / 1000));
  });
});

describe("Facebook parsers", () => {
  it("maps attachments and reel permalinks to post types", () => {
    expect(posts.data.map((post) => fbPostType(fbPostSchema.parse(post)))).toEqual(["reel", "video", "image"]);
    expect(fbPostType(fbPostSchema.parse({ id: "x", attachments: { data: [{ media_type: "album" }] } }))).toBe("carousel");
    expect(fbPostType(fbPostSchema.parse({ id: "x" }))).toBe("post");
  });

  it("assigns each value to the day that ends at end_time", () => {
    const rows = pageDailyRows(insightsSchema.parse(pageInsights), "America/Los_Angeles");
    expect(rows.filter((row) => row.metric === "page_media_view").map((row) => row.date)).toEqual(["2026-11-05", "2026-11-06", "2026-11-07"]);
  });

  it("reads the retention graph as 40 equal parts of the video, ignoring bad keys", () => {
    expect(retentionFromGraph({ "40": 0.2, "0": 1, "20": 0.5, x: 3 })).toEqual([
      { ratio: 0, audienceWatchRatio: 1, relativePerformance: null },
      { ratio: 0.5, audienceWatchRatio: 0.5, relativePerformance: null },
      { ratio: 1, audienceWatchRatio: 0.2, relativePerformance: null },
    ]);
    expect(retentionFromGraph(null)).toEqual([]);
  });

  it("keeps the lifetime value when a metric also comes back per day", () => {
    const rows = postInsightRows(
      insightsSchema.parse({
        data: [
          { name: "post_video_views", period: "day", values: [{ value: 1 }] },
          { name: "post_video_views", period: "lifetime", values: [{ value: 46 }] },
        ],
      }),
    );
    expect(rows).toEqual([{ metric: "post_video_views", value: 46 }]);
  });

  it("splits reactions by type and skips an empty reactions object", () => {
    expect(postInsightRows(insightsSchema.parse({ data: [{ name: "post_reactions_by_type_total", values: [{ value: { like: 3, love: 1 } }] }] }))).toEqual([
      { metric: "post_reactions_by_type_total", value: 4 },
      { metric: "post_reactions_by_type_total.like", value: 3 },
      { metric: "post_reactions_by_type_total.love", value: 1 },
    ]);
    expect(postInsightRows(insightsSchema.parse({ data: [{ name: "post_reactions_by_type_total", values: [{ value: {} }] }] }))).toEqual([]);
  });
});
