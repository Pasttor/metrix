import { describe, expect, it } from "vitest";
import ageGender from "../../../../tests/fixtures/youtube/analytics-age-gender.json";
import daily from "../../../../tests/fixtures/youtube/analytics-channel-daily.json";
import byContentType from "../../../../tests/fixtures/youtube/analytics-channel-by-content-type.json";
import country from "../../../../tests/fixtures/youtube/analytics-country.json";
import device from "../../../../tests/fixtures/youtube/analytics-device.json";
import empty from "../../../../tests/fixtures/youtube/analytics-empty.json";
import badRequest from "../../../../tests/fixtures/youtube/analytics-error-bad-request.json";
import traffic from "../../../../tests/fixtures/youtube/analytics-traffic-source.json";
import lifetime from "../../../../tests/fixtures/youtube/analytics-video-lifetime.json";
import channels from "../../../../tests/fixtures/youtube/channels-list.json";
import playlistPage1 from "../../../../tests/fixtures/youtube/playlist-items-page1.json";
import playlistPage2 from "../../../../tests/fixtures/youtube/playlist-items-page2.json";
import videosPage1 from "../../../../tests/fixtures/youtube/videos-page1.json";
import videosPage2 from "../../../../tests/fixtures/youtube/videos-page2.json";
import { addDays, daysBetween } from "@/lib/dates";
import type { Json } from "@/lib/db/types";
import { ReauthRequiredError, type AccessTokenGetter } from "@/lib/oauth/token-store";
import { HttpError } from "@/lib/platforms/http";
import type { MetricsStore, PostUpsert } from "@/lib/sync/metrics-store";
import type { AccountSyncInput, SyncAccount } from "@/lib/sync/types";
import { BACKFILL_CHUNK_DAYS, createYouTubeSyncer } from "./sync";

const SUNDAY = new Date("2026-11-08T18:00:00Z");
const MONDAY = new Date("2026-11-09T18:00:00Z");
const ACCOUNT: SyncAccount = { id: "acc-1", platform: "youtube", externalId: "UCfixture000000000000000", name: "Canal" };

type Report = { columnHeaders: { name: string; columnType: string; dataType: string }[]; rows?: (string | number)[][] };

/** Keeps the dimension columns and only the requested metrics, like the real API. */
function selectMetrics(report: Report, metrics: string[]): Report {
  const keep = report.columnHeaders.map((header, i) => (header.columnType === "DIMENSION" || metrics.includes(header.name) ? i : -1));
  const indexes = keep.filter((i) => i >= 0);
  return {
    columnHeaders: indexes.map((i) => report.columnHeaders[i]),
    rows: report.rows?.map((row) => indexes.map((i) => row[i])),
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type FakeOptions = { rejectMetrics?: string[]; emptyDaily?: boolean; channelsBody?: unknown; failWith?: Response; revokedToken?: string };

function fakeYouTube(options: FakeOptions = {}) {
  const calls: URL[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url);
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (options.revokedToken && auth === `Bearer ${options.revokedToken}`) {
      return json({ error: { code: 401, status: "UNAUTHENTICATED", errors: [{ reason: "authError" }] } }, 401);
    }
    const params = url.searchParams;
    if (options.failWith && url.pathname.endsWith("/reports")) return options.failWith.clone();

    if (url.pathname === "/youtube/v3/channels") return json(options.channelsBody ?? channels);
    if (url.pathname === "/youtube/v3/playlistItems") return json(params.get("pageToken") === "PAGE2" ? playlistPage2 : playlistPage1);
    if (url.pathname === "/youtube/v3/videos") return json(params.get("id")?.includes("vidLong") ? videosPage1 : videosPage2);
    if (url.pathname === "/v2/reports") {
      const metrics = params.get("metrics")!.split(",");
      if (metrics.some((metric) => options.rejectMetrics?.includes(metric))) return json(badRequest, 400);
      switch (params.get("dimensions")) {
        case "day":
          return json(options.emptyDaily ? empty : selectMetrics(daily, metrics));
        case "day,creatorContentType":
          return json(options.emptyDaily ? empty : selectMetrics(byContentType, metrics));
        case "ageGroup,gender":
          return json(ageGender);
        case "country":
          return json(country);
        case "deviceType":
          return json(device);
        case "insightTrafficSourceType":
          return json(traffic);
        case "video":
          return json(selectMetrics(lifetime, metrics));
      }
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const reports = (dimensions?: string) =>
    calls.filter((url) => url.pathname === "/v2/reports" && (!dimensions || url.searchParams.get("dimensions") === dimensions));
  return { fetch: fetch as typeof globalThis.fetch, calls, reports };
}

/** In-memory MetricsStore keyed by the real primary keys, to check idempotence. */
function memoryStore() {
  const accountMetrics = new Map<string, number>();
  const posts = new Map<string, PostUpsert & { id: string }>();
  const postMetrics = new Map<string, number>();
  const audience = new Map<string, number>();
  const store: MetricsStore = {
    async upsertAccountMetrics(accountId, rows) {
      for (const row of rows) accountMetrics.set(`${accountId}|${row.date}|${row.metric}`, row.value);
      return rows.length;
    },
    async upsertPosts(accountId, items) {
      const ids = new Map<string, string>();
      for (const post of items) {
        const key = `${accountId}|${post.externalId}`;
        const id = posts.get(key)?.id ?? `post-${post.externalId}`;
        posts.set(key, { ...post, id });
        ids.set(post.externalId, id);
      }
      return ids;
    },
    async upsertPostMetrics(capturedOn, rows) {
      for (const row of rows) postMetrics.set(`${row.postId}|${capturedOn}|${row.metric}`, row.value);
      return rows.length;
    },
    async upsertAudience(accountId, date, rows) {
      for (const row of rows) audience.set(`${accountId}|${date}|${row.dimension}|${row.key}`, row.value);
      return rows.length;
    },
    async listPostsSince(accountId, since) {
      return [...posts.entries()]
        .filter(([key, post]) => key.startsWith(`${accountId}|`) && post.publishedAt && new Date(post.publishedAt) >= since)
        .map(([, post]) => ({ id: post.id, externalId: post.externalId, publishedAt: post.publishedAt }))
        .sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!));
    },
  };
  return { store, accountMetrics, posts, postMetrics, audience };
}

function setup(options: FakeOptions & { monetary?: boolean; getAccessToken?: AccessTokenGetter } = {}) {
  const yt = fakeYouTube(options);
  const memory = memoryStore();
  const syncer = createYouTubeSyncer({
    getAccessToken: options.getAccessToken ?? (async () => "ya29.token"),
    store: memory.store,
    monetary: options.monetary ?? false,
    reportTimeZone: "America/Mexico_City",
    fetch: yt.fetch,
    retry: { sleep: async () => undefined },
  });
  const run = (input: Partial<AccountSyncInput> = {}) =>
    syncer.syncAccount({ account: ACCOUNT, job: "daily", cursor: null, shouldStop: () => false, now: SUNDAY, ...input });
  return { ...yt, ...memory, run };
}

describe("YouTube daily sync", () => {
  it("writes the channel snapshot, the last 7 days and every upload with its counters", async () => {
    const t = setup();
    const result = await t.run();

    expect(result).toMatchObject({ done: true, warnings: [], progress: 1 });
    // 1 channels.list + 2 playlist pages + 2 videos.list.
    expect(result.quotaUnits).toBe(5);

    const [dayReport] = t.reports("day");
    expect(dayReport.searchParams.get("ids")).toBe("channel==MINE");
    expect(dayReport.searchParams.get("startDate")).toBe("2026-11-01");
    expect(dayReport.searchParams.get("endDate")).toBe("2026-11-08");
    expect(t.reports("day,creatorContentType")).toHaveLength(1);
    expect(t.reports()).toHaveLength(2); // no audience on a Sunday

    expect(t.accountMetrics.get("acc-1|2026-11-08|subscriberCount")).toBe(789);
    expect(t.accountMetrics.get("acc-1|2026-11-04|views")).toBe(1200);
    expect(t.accountMetrics.get("acc-1|2026-11-06|views")).toBe(0);
    expect(t.accountMetrics.get("acc-1|2026-11-04|views.content_type.shorts")).toBe(1100);
    expect(t.accountMetrics.get("acc-1|2026-11-04|engagedViews.content_type.videoOnDemand")).toBe(95);
    expect(t.accountMetrics.size).toBe(27 + 3 + 8);

    expect([...t.posts.values()].map((post) => [post.externalId, post.type])).toEqual([
      ["vidLong00001", "video"],
      ["vidShort0001", "short"],
      ["vidOld000001", "short"],
    ]);
    expect(t.postMetrics.get("post-vidLong00001|2026-11-08|viewCount")).toBe(15230);
    expect(t.postMetrics.has("post-vidShort0001|2026-11-08|likeCount")).toBe(false);
    expect(t.postMetrics.size).toBe(8);
    expect(result.rowsWritten).toBe(30 + 8 + 3 + 8);
  });

  it("does not duplicate rows when it runs twice", async () => {
    const t = setup();
    await t.run();
    const sizes = [t.accountMetrics.size, t.posts.size, t.postMetrics.size, t.audience.size];
    await t.run();
    expect([t.accountMetrics.size, t.posts.size, t.postMetrics.size, t.audience.size]).toEqual(sizes);
  });

  it("on Mondays also saves the audience and lifetime stats of videos from the last 90 days", async () => {
    const t = setup();
    const result = await t.run({ now: MONDAY });
    expect(result.done).toBe(true);

    expect(t.audience.get("acc-1|2026-11-09|age_gender|age25-34|male")).toBe(38.1);
    expect(t.audience.get("acc-1|2026-11-09|country|MX")).toBe(8120);
    expect(t.audience.get("acc-1|2026-11-09|device|MOBILE")).toBe(7400);
    expect(t.audience.get("acc-1|2026-11-09|traffic_source|SHORTS")).toBe(5100);
    expect(t.audience.size).toBe(12);
    const [audienceQuery] = t.reports("country");
    expect(audienceQuery.searchParams.get("startDate")).toBe("2026-10-13");

    const [videoQuery] = t.reports("video");
    expect(videoQuery.searchParams.get("filters")).toBe("video==vidLong00001,vidShort0001");
    expect(videoQuery.searchParams.get("startDate")).toBe("2026-10-20");
    expect(t.postMetrics.get("post-vidLong00001|2026-11-09|estimatedMinutesWatched")).toBe(61200);
    expect(t.postMetrics.has("post-vidOld000001|2026-11-09|estimatedMinutesWatched")).toBe(false);
  });

  it("turns a metric the API rejects into a warning and keeps the others", async () => {
    const t = setup({ rejectMetrics: ["shares"] });
    const result = await t.run();
    expect(result.done).toBe(true);
    expect(result.warnings).toEqual([expect.stringContaining("shares")]);
    expect(t.accountMetrics.get("acc-1|2026-11-04|likes")).toBe(80);
    expect(t.accountMetrics.has("acc-1|2026-11-04|shares")).toBe(false);
  });

  it("writes no channel days when Analytics has no data yet", async () => {
    const t = setup({ emptyDaily: true });
    await t.run();
    expect([...t.accountMetrics.keys()].every((key) => key.startsWith("acc-1|2026-11-08|"))).toBe(true);
    expect(t.accountMetrics.size).toBe(3);
  });

  it("asks for revenue only when YOUTUBE_MONETARY is on", async () => {
    const off = setup();
    await off.run();
    expect(off.reports("day").some((url) => url.searchParams.get("metrics") === "estimatedRevenue")).toBe(false);

    const on = setup({ monetary: true });
    await on.run();
    expect(on.reports("day").some((url) => url.searchParams.get("metrics") === "estimatedRevenue")).toBe(true);
  });

  it("saves a cursor inside the uploads list and resumes from it", async () => {
    const t = setup();
    const stopAfterFirstPage = () => t.calls.some((url) => url.pathname === "/youtube/v3/videos");
    const first = await t.run({ shouldStop: stopAfterFirstPage });
    expect(first).toMatchObject({ done: false, cursor: { step: "videos", pageToken: "PAGE2" } });
    expect(t.posts.size).toBe(2);

    const second = await t.run({ cursor: first.cursor as Json });
    expect(second.done).toBe(true);
    expect(t.posts.size).toBe(3);
  });

  it("fails the account when the connected channel is gone and lets quota errors through", async () => {
    await expect(setup({ channelsBody: { items: [] } }).run()).rejects.toThrow(/reconecta/);
    const quota = json({ error: { code: 403, errors: [{ reason: "quotaExceeded" }] } }, 403);
    await expect(setup({ failWith: quota }).run()).rejects.toBeInstanceOf(HttpError);
  });
});

describe("revoked tokens", () => {
  it("forces one refresh after a 401 on an unexpired token and continues with the new token", async () => {
    const requested: (boolean | undefined)[] = [];
    const t = setup({
      revokedToken: "revoked",
      getAccessToken: async (_accountId, options) => {
        requested.push(options?.forceRefresh);
        return options?.forceRefresh ? "fresh" : "revoked";
      },
    });
    const result = await t.run();
    expect(result.done).toBe(true);
    expect(requested).toEqual([false, true]);
    expect(t.posts.size).toBe(3);
  });

  it("fails the account with ReauthRequiredError when the forced refresh is rejected", async () => {
    const t = setup({
      revokedToken: "revoked",
      getAccessToken: async (accountId, options) => {
        if (options?.forceRefresh) throw new ReauthRequiredError(accountId);
        return "revoked";
      },
    });
    await expect(t.run()).rejects.toBeInstanceOf(ReauthRequiredError);
  });
});

describe("YouTube backfill", () => {
  const created = "2019-03-14"; // channels-list.json publishedAt, in Pacific time
  const end = "2026-11-08";

  it("requests channel days since creation in 1-year blocks, then videos and audience", async () => {
    const t = setup();
    const result = await t.run({ job: "backfill" });
    expect(result.done).toBe(true);

    const blocks = t.reports("day");
    expect(blocks).toHaveLength(Math.ceil((daysBetween(created, end) + 1) / BACKFILL_CHUNK_DAYS));
    expect(blocks[0].searchParams.get("startDate")).toBe(created);
    expect(blocks[0].searchParams.get("endDate")).toBe(addDays(created, BACKFILL_CHUNK_DAYS - 1));
    expect(blocks[1].searchParams.get("startDate")).toBe(addDays(created, BACKFILL_CHUNK_DAYS));
    expect(blocks.at(-1)!.searchParams.get("endDate")).toBe(end);
    expect(t.posts.size).toBe(3);
    expect(t.audience.size).toBeGreaterThan(0);
  });

  it("stops between blocks with a cursor and progress, and resumes where it stopped", async () => {
    const t = setup();
    const first = await t.run({ job: "backfill", shouldStop: () => true });
    expect(first).toMatchObject({ done: false, cursor: { step: "analytics", from: addDays(created, BACKFILL_CHUNK_DAYS) } });
    expect(first.progress).toBeGreaterThan(0);
    expect(first.progress).toBeLessThan(0.25);

    const resumed = setup();
    const second = await resumed.run({ job: "backfill", cursor: first.cursor as Json });
    expect(second.done).toBe(true);
    expect(resumed.reports("day")[0].searchParams.get("startDate")).toBe(addDays(created, BACKFILL_CHUNK_DAYS));
  });

  it("ignores a cursor it cannot read and starts over", async () => {
    const t = setup();
    await t.run({ job: "backfill", cursor: { step: "nope" } as Json });
    expect(t.reports("day")[0].searchParams.get("startDate")).toBe(created);
  });
});
