import { describe, expect, it, vi } from "vitest";
import accountDay from "../../../../tests/fixtures/meta/ig-account-insights-day.json";
import demographicsCountry from "../../../../tests/fixtures/meta/ig-demographics-country.json";
import demographicsEmpty from "../../../../tests/fixtures/meta/ig-demographics-empty.json";
import reelInsights from "../../../../tests/fixtures/meta/ig-media-insights-reel.json";
import media from "../../../../tests/fixtures/meta/ig-media.json";
import profile from "../../../../tests/fixtures/meta/ig-profile.json";
import stories from "../../../../tests/fixtures/meta/ig-stories.json";
import metricRejected from "../../../../tests/fixtures/meta/error-metric-rejected.json";
import notEnoughViewers from "../../../../tests/fixtures/meta/error-not-enough-viewers.json";
import tokenExpired from "../../../../tests/fixtures/meta/error-token-expired.json";
import beforeConversion from "../../../../tests/fixtures/meta/error-before-conversion.json";
import type { Json } from "@/lib/db/types";
import { ReauthRequiredError } from "@/lib/oauth/token-store";
import type { MetricsStore, PostUpsert } from "@/lib/sync/metrics-store";
import type { AccountSyncInput, SyncAccount } from "@/lib/sync/types";
import { usagePercent } from "./client";
import { createInstagramSyncer, IG_BACKFILL_DAYS } from "./instagram-sync";
import { createMetaSyncer } from "./sync";

const SUNDAY = new Date("2026-11-08T18:00:00Z");
const MONDAY = new Date("2026-11-09T18:00:00Z");
const IG: SyncAccount = { id: "acc-ig", platform: "instagram", externalId: "17841400000000001", name: "casiquiebra" };

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

type Options = {
  rejectAccountMetrics?: string[];
  stories?: unknown;
  storyError?: unknown;
  usageHeader?: string;
  authError?: boolean;
  demographics?: unknown;
  beforeConversion?: string[];
};

function fakeGraph(options: Options = {}) {
  const calls: URL[] = [];
  const fetch = async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url);
    const params = url.searchParams;
    const path = url.pathname.replace("/v26.0/", "");
    const headers: Record<string, string> = options.usageHeader ? { "x-business-use-case-usage": options.usageHeader } : {};
    if (options.authError) return json(tokenExpired, 400);

    if (path === IG.externalId) return json(profile, 200, headers);
    if (path === `${IG.externalId}/media`) return json(media, 200, headers);
    if (path === `${IG.externalId}/stories`) return json(options.stories ?? { data: [] }, 200, headers);
    if (path === `${IG.externalId}/insights`) {
      if (params.get("metric") === "follower_demographics") {
        return json(params.get("breakdown") === "country" ? (options.demographics ?? demographicsCountry) : demographicsEmpty, 200, headers);
      }
      const metrics = params.get("metric")!.split(",");
      if (metrics.some((metric) => options.rejectAccountMetrics?.includes(metric))) return json(metricRejected, 400, headers);
      return json({ data: accountDay.data.filter((item) => metrics.includes(item.name)) }, 200, headers);
    }
    if (path.endsWith("/insights")) {
      if (path.startsWith("18000000000000009")) return options.storyError ? json(options.storyError, 400) : json({ data: [] });
      if (options.beforeConversion?.some((id) => path.startsWith(id))) return json(beforeConversion, 400);
      const metrics = params.get("metric")!.split(",");
      return json({ data: reelInsights.data.filter((item) => metrics.includes(item.name)) }, 200, headers);
    }
    throw new Error(`unexpected fetch ${path}`);
  };
  const insightCalls = (prefix: string) => calls.filter((url) => url.pathname.endsWith("/insights") && url.pathname.includes(prefix));
  return { fetch: fetch as typeof globalThis.fetch, calls, insightCalls };
}

function memoryStore() {
  const accountMetrics = new Map<string, number>();
  const posts = new Map<string, PostUpsert & { id: string }>();
  const postMetrics = new Map<string, number>();
  const audience = new Map<string, number>();
  const store: MetricsStore = {
    async upsertAccountMetrics(accountId, rows) {
      for (const row of rows) accountMetrics.set(`${row.date}|${row.metric}`, row.value);
      return rows.length;
    },
    async upsertPosts(accountId, items) {
      const ids = new Map<string, string>();
      for (const post of items) {
        posts.set(post.externalId, { ...post, id: `post-${post.externalId}` });
        ids.set(post.externalId, `post-${post.externalId}`);
      }
      return ids;
    },
    async upsertPostMetrics(capturedOn, rows) {
      for (const row of rows) postMetrics.set(`${row.postId}|${capturedOn}|${row.metric}`, row.value);
      return rows.length;
    },
    async upsertAudience(accountId, date, rows) {
      for (const row of rows) audience.set(`${date}|${row.dimension}|${row.key}`, row.value);
      return rows.length;
    },
    async listPostsSince() {
      return [];
    },
  };
  return { store, accountMetrics, posts, postMetrics, audience };
}

function setup(options: Options = {}) {
  const graph = fakeGraph(options);
  const memory = memoryStore();
  const markReauthRequired = vi.fn(async () => undefined);
  const syncer = createInstagramSyncer({
    getAccessToken: async () => "EAApage",
    markReauthRequired,
    store: memory.store,
    version: "v26.0",
    reportTimeZone: "America/Mexico_City",
    fetch: graph.fetch,
    retry: { sleep: async () => undefined },
  });
  const run = (input: Partial<AccountSyncInput> = {}) =>
    syncer.syncAccount({ account: IG, job: "daily", cursor: null, shouldStop: () => false, now: SUNDAY, ...input });
  return { ...graph, ...memory, markReauthRequired, run };
}

describe("Instagram daily sync", () => {
  it("snapshots followers, re-requests the last 3 finished Pacific days and writes posts", async () => {
    const t = setup();
    const result = await t.run();
    expect(result).toMatchObject({ done: true, warnings: [] });

    expect(t.accountMetrics.get("2026-11-08|followers_count")).toBe(1);
    expect(t.accountMetrics.get("2026-11-08|media_count")).toBe(5);

    const dayCalls = t.calls.filter((url) => url.pathname.endsWith(`${IG.externalId}/insights`));
    expect(dayCalls).toHaveLength(3);
    const [first] = dayCalls;
    expect(first.searchParams.get("metric_type")).toBe("total_value");
    expect(first.searchParams.get("period")).toBe("day");
    // 2026-11-05 starts at 08:00 UTC (PST).
    expect(first.searchParams.get("since")).toBe(String(Date.parse("2026-11-05T08:00:00Z") / 1000));
    expect(first.searchParams.get("until")).toBe(String(Date.parse("2026-11-06T08:00:00Z") / 1000));
    expect(t.accountMetrics.get("2026-11-07|views")).toBe(121);
    expect(t.accountMetrics.get("2026-11-07|reach")).toBe(95);
    // Not in the response (fewer than 100 followers): nothing written, never 0.
    expect(t.accountMetrics.has("2026-11-07|follows_and_unfollows")).toBe(false);

    expect([...t.posts.values()].map((post) => [post.externalId, post.type])).toEqual([
      ["18000000000000001", "reel"],
      ["18000000000000002", "carousel"],
      ["18000000000000003", "image"],
    ]);
    // Daily: only posts from the last 30 days get insights.
    expect(t.insightCalls("18000000000000003")).toHaveLength(0);
    const reelCall = t.insightCalls("18000000000000001")[0];
    expect(reelCall.searchParams.get("metric")).toContain("ig_reels_avg_watch_time");
    expect(t.insightCalls("18000000000000002")[0].searchParams.get("metric")).not.toContain("ig_reels");
    expect(t.postMetrics.get("post-18000000000000001|2026-11-08|ig_reels_avg_watch_time")).toBe(13432);
    expect(t.postMetrics.get("post-18000000000000001|2026-11-08|reels_skip_rate")).toBe(44.7);
    expect(t.audience.size).toBe(0);
    expect(result.quotaUnits).toBe(t.calls.length);
  });

  it("on Mondays refreshes every post and saves follower demographics when Meta returns them", async () => {
    const t = setup();
    await t.run({ now: MONDAY });
    expect(t.insightCalls("18000000000000003")).toHaveLength(1);
    expect(t.audience.get("2026-11-09|country|MX")).toBe(812);
    const demographicsCall = t.calls.find((url) => url.searchParams.get("metric") === "follower_demographics")!;
    expect(Object.fromEntries(demographicsCall.searchParams)).toMatchObject({ period: "lifetime", metric_type: "total_value", timeframe: "last_30_days" });
  });

  it("writes no audience when demographics come back empty (under 100 followers)", async () => {
    const t = setup({ demographics: demographicsEmpty });
    await t.run({ now: MONDAY });
    expect(t.audience.size).toBe(0);
  });

  it("turns a rejected metric into a warning and keeps the rest", async () => {
    const t = setup({ rejectAccountMetrics: ["reposts"] });
    const result = await t.run();
    expect(result.done).toBe(true);
    expect(result.warnings).toEqual([expect.stringMatching(/reposts.*OAuthException:100/)]);
    expect(t.accountMetrics.get("2026-11-07|views")).toBe(121);
    expect(t.accountMetrics.has("2026-11-07|reposts")).toBe(false);
  });

  it("skips posts published before the switch to a professional account with a single warning", async () => {
    const t = setup({ beforeConversion: ["18000000000000002"] });
    const result = await t.run();
    expect(result.done).toBe(true);
    expect(result.warnings).toEqual(["1 publicación(es) son anteriores al cambio a cuenta profesional y Meta no guarda sus insights"]);
    expect(t.insightCalls("18000000000000002")).toHaveLength(1); // no metric-by-metric retries
    expect(t.postMetrics.get("post-18000000000000001|2026-11-08|views")).toBe(289);
  });

  it("saves stories and skips their insights silently when there are not enough viewers", async () => {
    const t = setup({ stories, storyError: notEnoughViewers });
    const result = await t.run();
    expect(t.posts.get("18000000000000009")?.type).toBe("story");
    expect(result.warnings).toEqual([]);
  });

  it("pauses above 80 % of Meta's rate limit and leaves a cursor", async () => {
    const usageHeader = JSON.stringify({ "1417413731452396": [{ type: "instagram", call_count: 85, total_cputime: 4, total_time: 5 }] });
    const t = setup({ usageHeader });
    const result = await t.run();
    expect(result).toMatchObject({ done: false, cursor: { step: "account" } });
    expect(result.warnings).toEqual([expect.stringContaining("85 %")]);
  });

  it("marks the account for reconnection when Meta rejects the token", async () => {
    const t = setup({ authError: true });
    await expect(t.run()).rejects.toBeInstanceOf(ReauthRequiredError);
    expect(t.markReauthRequired).toHaveBeenCalledWith("acc-ig");
  });
});

describe("Instagram backfill", () => {
  it("requests the last 90 days one call per day, every post and demographics", async () => {
    const t = setup();
    const result = await t.run({ job: "backfill" });
    expect(result.done).toBe(true);
    expect(t.calls.filter((url) => url.pathname.endsWith(`${IG.externalId}/insights`) && url.searchParams.get("period") === "day")).toHaveLength(IG_BACKFILL_DAYS);
    expect(t.insightCalls("18000000000000003")).toHaveLength(1);
  });

  it("stops between days with a cursor and resumes from it", async () => {
    const t = setup();
    let dayCalls = 0;
    const stopAfterTwoDays = () => {
      dayCalls = t.calls.filter((url) => url.searchParams.get("period") === "day").length;
      return dayCalls >= 2;
    };
    const first = await t.run({ job: "backfill", shouldStop: stopAfterTwoDays });
    expect(first).toMatchObject({ done: false, cursor: { step: "account", from: "2026-08-12" } });

    const resumed = setup();
    await resumed.run({ job: "backfill", cursor: first.cursor as Json });
    const firstDay = resumed.calls.find((url) => url.searchParams.get("period") === "day")!;
    expect(firstDay.searchParams.get("since")).toBe(String(Date.parse("2026-08-12T07:00:00Z") / 1000));
  });
});

describe("usagePercent", () => {
  it("reads the highest usage across Meta's headers", () => {
    expect(usagePercent(new Headers({ "x-app-usage": JSON.stringify({ call_count: 12, total_time: 30, total_cputime: 5 }) }))).toBe(30);
    expect(
      usagePercent(new Headers({ "x-business-use-case-usage": JSON.stringify({ "1": [{ type: "instagram", call_count: 2, estimated_time_to_regain_access: 7 }] }) })),
    ).toBe(100);
    expect(usagePercent(new Headers({ "x-app-usage": "not json" }))).toBe(0);
  });
});

describe("createMetaSyncer", () => {
  it("routes Instagram accounts and leaves platforms without a syncer untouched", async () => {
    const instagram = { syncAccount: vi.fn(async () => ({ done: true, rowsWritten: 3, warnings: [] })) };
    const syncer = createMetaSyncer({ instagram });
    const base = { job: "daily" as const, cursor: null, shouldStop: () => false, now: SUNDAY };
    expect(await syncer.syncAccount({ ...base, account: IG })).toMatchObject({ rowsWritten: 3 });
    expect(await syncer.syncAccount({ ...base, account: { ...IG, platform: "facebook" } })).toMatchObject({ done: true, rowsWritten: 0 });
    expect(instagram.syncAccount).toHaveBeenCalledTimes(1);
  });
});
