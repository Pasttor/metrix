import { describe, expect, it, vi } from "vitest";
import { ConnectorError } from "@/lib/oauth/connector";
import { RefreshRejectedError } from "@/lib/oauth/token-store";
import { GOOGLE_TOKEN_URL } from "@/lib/platforms/youtube/connector";
import { createDriveConnector, DRIVE_SCOPES, GOOGLE_USERINFO_URL } from "./connector";

const NOW = new Date("2026-11-09T12:00:00Z");
const REDIRECT = "https://metrix-swart-mu.vercel.app/api/connect/drive/callback";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const TOKEN = {
  access_token: "ya29.drive",
  expires_in: 3599,
  refresh_token: "1//refresh",
  scope: `openid ${DRIVE_SCOPES.file} https://www.googleapis.com/auth/userinfo.email`,
  token_type: "Bearer",
};
const USER = { sub: "1098765432101234567890", email: "videos@example.com", email_verified: true, picture: "https://lh3.example/photo.jpg" };

function setup(routes: { token?: () => Response; user?: () => Response } = {}) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void init;
    const url = String(input);
    if (url === GOOGLE_TOKEN_URL) return (routes.token ?? (() => json(TOKEN)))();
    if (url === GOOGLE_USERINFO_URL) return (routes.user ?? (() => json(USER)))();
    throw new Error(`unexpected fetch ${url}`);
  });
  const connector = createDriveConnector({ clientId: "client-id", clientSecret: "secret", fetch: fetch as unknown as typeof globalThis.fetch, retry: { sleep: async () => undefined }, now: () => NOW });
  const callback = () => connector.handleCallback({ code: "code", codeVerifier: "verifier", redirectUri: REDIRECT, searchParams: new URLSearchParams() });
  return { connector, callback, fetch };
}

describe("Google Drive connector", () => {
  it("asks only for drive.file and the email, letting the user choose the account", () => {
    const url = new URL(setup().connector.buildAuthUrl({ state: "st", codeChallenge: "ch", redirectUri: REDIRECT }));
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(["openid", "email", DRIVE_SCOPES.file]);
    expect(url.searchParams.get("prompt")).toBe("consent select_account");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("returns the Google account, named by its email", async () => {
    const [account] = await setup().callback();
    expect(account).toMatchObject({ platform: "drive", externalId: USER.sub, name: "videos@example.com", handle: null, avatarUrl: USER.picture });
    expect(account.tokens).toMatchObject({ accessToken: "ya29.drive", refreshToken: "1//refresh", expiresAt: new Date(NOW.getTime() + 3599_000) });
  });

  it("rejects a consent without drive.file", async () => {
    await expect(setup({ token: () => json({ ...TOKEN, scope: "openid email" }) }).callback()).rejects.toMatchObject({ code: "missing_scopes" });
  });

  it("needs a refresh token", async () => {
    const { refresh_token: _drop, ...rest } = TOKEN;
    void _drop;
    await expect(setup({ token: () => json(rest) }).callback()).rejects.toBeInstanceOf(ConnectorError);
  });

  it("marks a revoked refresh token for reconnection", async () => {
    const { connector } = setup({ token: () => json({ error: "invalid_grant" }, 400) });
    await expect(connector.refresh("1//refresh")).rejects.toBeInstanceOf(RefreshRejectedError);
  });
});
