import { describe, expect, it, vi } from "vitest";
import channelsEmpty from "../../../../tests/fixtures/youtube/channels-list-empty.json";
import channels from "../../../../tests/fixtures/youtube/channels-list.json";
import tokenFixture from "../../../../tests/fixtures/youtube/token.json";
import { ConnectorError } from "@/lib/oauth/connector";
import { RefreshRejectedError } from "@/lib/oauth/token-store";
import { HttpError } from "@/lib/platforms/http";
import { createYouTubeConnector, GOOGLE_TOKEN_URL, YOUTUBE_SCOPES, type YouTubeConnectorConfig } from "./connector";

const NOW = new Date("2026-11-08T12:00:00Z");
const REDIRECT = "http://localhost:3000/api/connect/youtube/callback";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Routes = { token?: () => Response; channels?: () => Response };

function fakeFetch(routes: Routes) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    void _init;
    const url = String(input);
    if (url === GOOGLE_TOKEN_URL) return (routes.token ?? (() => json(tokenFixture)))();
    if (url.startsWith("https://www.googleapis.com/youtube/v3/channels")) return (routes.channels ?? (() => json(channels)))();
    throw new Error(`unexpected fetch ${url}`);
  });
}

function connector(routes: Routes = {}, overrides: Partial<YouTubeConnectorConfig> = {}) {
  const fetch = fakeFetch(routes);
  const instance = createYouTubeConnector({
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "client-secret",
    monetary: false,
    fetch,
    retry: { sleep: async () => undefined },
    now: () => NOW,
    ...overrides,
  });
  return { instance, fetch };
}

const callback = (instance: ReturnType<typeof connector>["instance"]) =>
  instance.handleCallback({
    code: "auth-code",
    codeVerifier: "verifier",
    redirectUri: REDIRECT,
    searchParams: new URLSearchParams(),
  });

describe("buildAuthUrl", () => {
  it("asks for offline access with consent, PKCE and the read-only scopes", () => {
    const url = new URL(connector().instance.buildAuthUrl({ state: "st", codeChallenge: "ch", redirectUri: REDIRECT }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "client-id.apps.googleusercontent.com",
      redirect_uri: REDIRECT,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      state: "st",
      code_challenge: "ch",
      code_challenge_method: "S256",
    });
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([YOUTUBE_SCOPES.readonly, YOUTUBE_SCOPES.analytics, YOUTUBE_SCOPES.upload, YOUTUBE_SCOPES.driveFile]);
  });

  it("adds the monetary scope only when YOUTUBE_MONETARY is on", () => {
    const url = new URL(
      connector({}, { monetary: true }).instance.buildAuthUrl({ state: "st", codeChallenge: "ch", redirectUri: REDIRECT }),
    );
    expect(url.searchParams.get("scope")?.split(" ")).toContain(YOUTUBE_SCOPES.monetary);
  });
});

describe("handleCallback", () => {
  it("exchanges the code with the verifier and maps the channel to an account", async () => {
    const { instance, fetch } = connector();
    const accounts = await callback(instance);

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const body = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(body)).toMatchObject({
      grant_type: "authorization_code",
      code: "auth-code",
      code_verifier: "verifier",
      redirect_uri: REDIRECT,
      client_id: "client-id.apps.googleusercontent.com",
      client_secret: "client-secret",
    });

    const [channelsUrl, channelsInit] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(new URL(channelsUrl).searchParams.get("mine")).toBe("true");
    expect(new URL(channelsUrl).searchParams.get("part")).toBe("snippet,statistics,contentDetails");
    expect(channelsInit.headers).toMatchObject({ Authorization: "Bearer ya29.fixture-access-token" });

    expect(accounts).toEqual([
      {
        platform: "youtube",
        externalId: "UCfixture000000000000000",
        name: "Canal de prueba",
        handle: "canaldeprueba",
        avatarUrl: "https://yt3.ggpht.com/fixture=s240",
        tokens: {
          accessToken: "ya29.fixture-access-token",
          refreshToken: "1//fixture-refresh-token",
          expiresAt: new Date(NOW.getTime() + 3599 * 1000),
          refreshExpiresAt: null,
          scopes: [YOUTUBE_SCOPES.analytics, YOUTUBE_SCOPES.readonly],
        },
      },
    ]);
  });

  it("fails with no_refresh_token when Google omits the refresh token", async () => {
    const { refresh_token: _unused, ...withoutRefresh } = tokenFixture;
    void _unused;
    const { instance, fetch } = connector({ token: () => json(withoutRefresh) });
    await expect(callback(instance)).rejects.toMatchObject({ name: "ConnectorError", code: "no_refresh_token" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fails with missing_scopes when the user unticks a required scope", async () => {
    const { instance } = connector({ token: () => json({ ...tokenFixture, scope: YOUTUBE_SCOPES.readonly }) });
    await expect(callback(instance)).rejects.toMatchObject({ code: "missing_scopes" });
  });

  it("fails with no_channel when the account has no YouTube channel", async () => {
    const { instance } = connector({ channels: () => json(channelsEmpty) });
    await expect(callback(instance)).rejects.toMatchObject({ code: "no_channel" });
  });

  it("reports a rejected code without leaking the provider body", async () => {
    const { instance } = connector({
      token: () => json({ error: "invalid_grant", error_description: "Bad code auth-code" }, 400),
    });
    const error = await callback(instance).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as ConnectorError).code).toBe("token_exchange_failed");
    expect((error as Error).message).not.toContain("auth-code");
  });

  it("maps a channels.list failure to channel_lookup_failed without the token", async () => {
    const { instance } = connector({
      channels: () => json({ error: { code: 403, status: "PERMISSION_DENIED", errors: [{ reason: "forbidden" }] } }, 403),
    });
    const error = (await callback(instance).catch((e: unknown) => e)) as ConnectorError;
    expect(error.code).toBe("channel_lookup_failed");
    expect(error.message).toContain("403 forbidden");
    expect(error.message).not.toContain("ya29");
  });

  it("retries transient Google errors", async () => {
    let calls = 0;
    const { instance } = connector({ channels: () => (++calls < 3 ? json({}, 503) : json(channels)) });
    await expect(callback(instance)).resolves.toHaveLength(1);
    expect(calls).toBe(3);
  });
});

describe("refresh", () => {
  it("returns new tokens and leaves the refresh token to the store", async () => {
    const { access_token, expires_in, scope, token_type } = tokenFixture;
    const { instance, fetch } = connector({ token: () => json({ access_token, expires_in, scope, token_type }) });
    const tokens = await instance.refresh("1//old-refresh");

    const body = new URLSearchParams(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("1//old-refresh");
    expect(tokens).toMatchObject({ accessToken: "ya29.fixture-access-token", refreshToken: null });
    expect(tokens.expiresAt).toEqual(new Date(NOW.getTime() + 3599 * 1000));
  });

  it("throws RefreshRejectedError on invalid_grant so the account is marked for reconnection", async () => {
    const { instance } = connector({ token: () => json({ error: "invalid_grant" }, 400) });
    await expect(instance.refresh("1//revoked")).rejects.toBeInstanceOf(RefreshRejectedError);
  });

  it("throws a plain HttpError for other failures", async () => {
    const { instance } = connector({ token: () => json({ error: "invalid_client" }, 401) });
    await expect(instance.refresh("1//x")).rejects.toBeInstanceOf(HttpError);
  });
});
