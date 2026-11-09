import { describe, expect, it, vi } from "vitest";
import scopeError from "../../../../tests/fixtures/tiktok/error-scope.json";
import tokenInvalid from "../../../../tests/fixtures/tiktok/error-token-invalid.json";
import tokenBasic from "../../../../tests/fixtures/tiktok/token-basic-only.json";
import tokenError from "../../../../tests/fixtures/tiktok/token-error.json";
import tokenFixture from "../../../../tests/fixtures/tiktok/token.json";
import userInfo from "../../../../tests/fixtures/tiktok/user-info.json";
import page1 from "../../../../tests/fixtures/tiktok/video-list-page1.json";
import page2 from "../../../../tests/fixtures/tiktok/video-list-page2.json";
import type { Json } from "@/lib/db/types";
import { ConnectorError } from "@/lib/oauth/connector";
import { RefreshRejectedError } from "@/lib/oauth/token-store";
import type { MetricsStore, PostUpsert } from "@/lib/sync/metrics-store";
import { createTikTokConnector, missingScopes, TIKTOK_TOKEN_URL } from "./connector";
import { createTikTokSyncer } from "./sync";

const NOW = new Date("2026-11-09T18:00:00Z");
const REDIRECT = "https://metrix-swart-mu.vercel.app/api/connect/tiktok/callback";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function connector(routes: { token?: () => Response; user?: (fields: string) => Response } = {}) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void init;
    const url = new URL(String(input));
    if (String(input) === TIKTOK_TOKEN_URL) return (routes.token ?? (() => json(tokenFixture)))();
    if (url.pathname === "/v2/user/info/") return (routes.user ?? (() => json(userInfo)))(url.searchParams.get("fields") ?? "");
    throw new Error(`unexpected fetch ${url}`);
  });
  const instance = createTikTokConnector({
    clientKey: "sbaw-client-key",
    clientSecret: "client-secret",
    fetch: fetch as unknown as typeof globalThis.fetch,
    retry: { sleep: async () => undefined },
    now: () => NOW,
  });
  const callback = () => instance.handleCallback({ code: "auth-code", codeVerifier: "unused", redirectUri: REDIRECT, searchParams: new URLSearchParams() });
  return { instance, fetch, callback };
}

describe("TikTok connector", () => {
  it("opens Login Kit with the read-only scopes, no PKCE", () => {
    const url = new URL(connector().instance.buildAuthUrl({ state: "st", codeChallenge: "ch", redirectUri: REDIRECT }));
    expect(url.origin + url.pathname).toBe("https://www.tiktok.com/v2/auth/authorize/");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_key: "sbaw-client-key",
      response_type: "code",
      scope: "user.info.basic,user.info.profile,user.info.stats,video.list",
      redirect_uri: REDIRECT,
      state: "st",
    });
  });

  it("exchanges the code and maps the account, asking only for granted fields", async () => {
    const { fetch, callback } = connector();
    const [account] = await callback();
    const body = new URLSearchParams(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(Object.fromEntries(body)).toMatchObject({ client_key: "sbaw-client-key", client_secret: "client-secret", code: "auth-code", grant_type: "authorization_code", redirect_uri: REDIRECT });
    expect(account).toMatchObject({
      platform: "tiktok",
      externalId: "_000fixtureOpenId",
      name: "Casi Quiebra",
      handle: "casiquiebra",
      avatarUrl: "https://p16-sign.tiktokcdn.com/avatar.jpeg",
      tokens: {
        accessToken: "act.fixture-access",
        refreshToken: "rft.fixture-refresh",
        expiresAt: new Date(NOW.getTime() + 86_400_000),
        refreshExpiresAt: new Date(NOW.getTime() + 31_536_000_000),
        scopes: ["user.info.basic", "user.info.profile", "user.info.stats", "video.list"],
      },
    });
  });

  it("connects with partial scopes and requests only the basic fields", async () => {
    let fields = "";
    const { callback } = connector({
      token: () => json(tokenBasic),
      user: (requested) => {
        fields = requested;
        return json(userInfo);
      },
    });
    const [account] = await callback();
    expect(fields).toBe("open_id,union_id,avatar_url,display_name");
    expect(missingScopes(account.tokens.scopes ?? [])).toEqual(["user.info.profile", "user.info.stats"]);
  });

  it("reports a rejected code (TikTok answers 200 with an error) without leaking it", async () => {
    const { callback } = connector({ token: () => json(tokenError) });
    const error = (await callback().catch((e: unknown) => e)) as ConnectorError;
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error.code).toBe("token_exchange_failed");
    expect(error.message).not.toContain("secret");
  });

  it("refreshes, and maps invalid_grant to RefreshRejectedError", async () => {
    const ok = connector();
    await expect(ok.instance.refresh("rft.old")).resolves.toMatchObject({ accessToken: "act.fixture-access", refreshToken: "rft.fixture-refresh" });
    const rejected = connector({ token: () => json(tokenError) });
    await expect(rejected.instance.refresh("rft.old")).rejects.toBeInstanceOf(RefreshRejectedError);
  });
});

function memoryStore() {
  const accountMetrics = new Map<string, number>();
  const posts = new Map<string, PostUpsert>();
  const postMetrics = new Map<string, number>();
  const store: MetricsStore = {
    async upsertAccountMetrics(_id, rows) {
      for (const row of rows) accountMetrics.set(`${row.date}|${row.metric}`, row.value);
      return rows.length;
    },
    async upsertPosts(_id, items) {
      const ids = new Map<string, string>();
      for (const item of items) {
        posts.set(item.externalId, item);
        ids.set(item.externalId, `post-${item.externalId}`);
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
  };
  return { store, accountMetrics, posts, postMetrics };
}

function syncer(options: { userError?: unknown; firstTokenRevoked?: boolean; videoScopeMissing?: boolean } = {}) {
  const calls: { url: URL; body: unknown; auth: string | undefined }[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null, auth });
    if (options.firstTokenRevoked && auth === "Bearer revoked") return json(tokenInvalid, 401);
    if (url.pathname === "/v2/user/info/") {
      const fields = url.searchParams.get("fields")!.split(",");
      if (options.userError && fields.includes("follower_count")) return json(options.userError);
      // Like TikTok: only the requested fields come back.
      const user = Object.fromEntries(Object.entries(userInfo.data.user).filter(([key]) => fields.includes(key)));
      return json({ ...userInfo, data: { user } });
    }
    if (url.pathname === "/v2/video/list/") {
      if (options.videoScopeMissing) return json(scopeError);
      const cursor = (calls.at(-1)!.body as { cursor?: number }).cursor;
      return json(cursor ? page2 : page1);
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const memory = memoryStore();
  const tokens: (boolean | undefined)[] = [];
  const instance = createTikTokSyncer({
    getAccessToken: async (_id, opts) => {
      tokens.push(opts?.forceRefresh);
      return options.firstTokenRevoked && !opts?.forceRefresh ? "revoked" : "act.fixture-access";
    },
    store: memory.store,
    reportTimeZone: "America/Mexico_City",
    fetch: fetch as typeof globalThis.fetch,
    retry: { sleep: async () => undefined },
  });
  const account = { id: "acc-tt", platform: "tiktok" as const, externalId: "_000fixtureOpenId", name: "Casi Quiebra" };
  const run = (input: { cursor?: Json; shouldStop?: () => boolean } = {}) =>
    instance.syncAccount({ account, job: "daily", cursor: input.cursor ?? null, shouldStop: input.shouldStop ?? (() => false), now: NOW });
  return { ...memory, calls, tokens, run };
}

describe("TikTok syncer", () => {
  it("snapshots the profile counters and every video, following the cursor", async () => {
    const t = syncer();
    const result = await t.run();
    expect(result).toMatchObject({ done: true, warnings: [] });
    expect(t.accountMetrics.get("2026-11-09|follower_count")).toBe(120);
    expect(t.accountMetrics.get("2026-11-09|likes_count")).toBe(3400);
    expect(t.posts.size).toBe(3);
    expect(t.posts.get("7300000000000000002")).toMatchObject({ type: "video", caption: "Kodak inventó la cámara digital", durationSeconds: 54 });
    expect(t.posts.get("7300000000000000001")?.publishedAt).toBe(new Date(1794100000 * 1000).toISOString());
    expect(t.postMetrics.get("post-7300000000000000001|2026-11-09|view_count")).toBe(1520);
    // Missing counters are skipped, not written as 0.
    expect(t.postMetrics.has("post-7300000000000000003|2026-11-09|like_count")).toBe(false);
    const listCalls = t.calls.filter((call) => call.url.pathname === "/v2/video/list/");
    expect(listCalls.map((call) => call.body)).toEqual([{ max_count: 20 }, { max_count: 20, cursor: 1794000000000 }]);
  });

  it("stops between pages with a cursor and resumes from it", async () => {
    const t = syncer();
    const first = await t.run({ shouldStop: () => true });
    expect(first).toMatchObject({ done: false, cursor: { step: "videos", videoCursor: 1794000000000 } });
    const resumed = syncer();
    await resumed.run({ cursor: first.cursor as Json });
    expect(resumed.calls.some((call) => call.url.pathname === "/v2/user/info/")).toBe(false);
    expect(resumed.posts.has("7300000000000000003")).toBe(true);
  });

  it("refreshes once when TikTok rejects an unexpired token", async () => {
    const t = syncer({ firstTokenRevoked: true });
    expect((await t.run()).done).toBe(true);
    expect(t.tokens).toEqual([false, true]);
  });

  it("falls back to basic fields and warns when stats were not granted", async () => {
    const t = syncer({ userError: scopeError });
    const result = await t.run();
    expect(result.warnings).toEqual([expect.stringContaining("estadísticas")]);
    expect(t.accountMetrics.size).toBe(0);
    expect(t.posts.size).toBe(3);
  });

  it("warns instead of failing without video.list", async () => {
    const t = syncer({ videoScopeMissing: true });
    const result = await t.run();
    expect(result.done).toBe(true);
    expect(result.warnings).toEqual([expect.stringContaining("video.list")]);
  });
});
