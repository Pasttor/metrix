import { describe, expect, it, vi } from "vitest";
import invalidCode from "../../../../tests/fixtures/meta/error-invalid-code.json";
import accountsPage1 from "../../../../tests/fixtures/meta/me-accounts-page1.json";
import accountsPage2 from "../../../../tests/fixtures/meta/me-accounts-page2.json";
import permissions from "../../../../tests/fixtures/meta/me-permissions.json";
import tokenLong from "../../../../tests/fixtures/meta/token-long.json";
import tokenShort from "../../../../tests/fixtures/meta/token-short.json";
import { ConnectorError } from "@/lib/oauth/connector";
import { RefreshRejectedError } from "@/lib/oauth/token-store";
import { createMetaConnector, META_SCOPES, type MetaConnectorConfig } from "./connector";

const withBusinessManagement = {
  data: [...permissions.data, { permission: "business_management", status: "granted" }],
};

const NOW = new Date("2026-11-08T12:00:00Z");
const REDIRECT = "http://localhost:3000/api/connect/meta/callback";
const TOKEN_URL = "https://graph.facebook.com/v26.0/oauth/access_token";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Routes = {
  exchange?: () => Response;
  permissions?: () => Response;
  accounts?: () => Response;
  businesses?: () => Response;
  ownedPages?: () => Response;
};

function setup(routes: Routes = {}, overrides: Partial<MetaConnectorConfig> = {}) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (String(input) === TOKEN_URL) {
      const body = new URLSearchParams(String(init?.body));
      if (body.get("grant_type") === "fb_exchange_token") return json(tokenLong);
      return (routes.exchange ?? (() => json(tokenShort)))();
    }
    if (url.pathname === "/v26.0/me/permissions") return (routes.permissions ?? (() => json(permissions)))();
    if (url.pathname === "/v26.0/me/accounts") {
      if (routes.accounts) return routes.accounts();
      return json(url.searchParams.get("after") ? accountsPage2 : accountsPage1);
    }
    if (url.pathname === "/v26.0/me/businesses") return (routes.businesses ?? (() => json({ data: [] })))();
    if (url.pathname === "/v26.0/555/owned_pages") return (routes.ownedPages ?? (() => json({ data: [] })))();
    if (url.pathname === "/v26.0/555/client_pages") return json({ data: [] });
    throw new Error(`unexpected fetch ${url.pathname}`);
  });
  const connector = createMetaConnector({
    appId: "1804672957308377",
    appSecret: "app-secret",
    version: "v26.0",
    fetch: fetch as unknown as typeof globalThis.fetch,
    retry: { sleep: async () => undefined },
    now: () => NOW,
    ...overrides,
  });
  const callback = () => connector.handleCallback({ code: "auth-code", codeVerifier: "verifier", redirectUri: REDIRECT, searchParams: new URLSearchParams() });
  return { connector, fetch, callback };
}

describe("buildAuthUrl", () => {
  it("opens Meta's dialog with the read-only scopes and PKCE", () => {
    const url = new URL(setup().connector.buildAuthUrl({ state: "st", codeChallenge: "ch", redirectUri: REDIRECT }));
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v26.0/dialog/oauth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "1804672957308377",
      redirect_uri: REDIRECT,
      response_type: "code",
      state: "st",
      code_challenge: "ch",
      code_challenge_method: "S256",
    });
    expect(url.searchParams.get("scope")?.split(",")).toEqual([...META_SCOPES, "business_management", "instagram_content_publish", "pages_manage_posts"]);
    expect(url.searchParams.has("config_id")).toBe(false);
  });

  it("uses the Facebook Login for Business configuration instead of scope when set", () => {
    const url = new URL(
      setup({}, { loginConfigId: "998877" }).connector.buildAuthUrl({ state: "st", codeChallenge: "ch", redirectUri: REDIRECT }),
    );
    expect(url.searchParams.get("config_id")).toBe("998877");
    expect(url.searchParams.has("scope")).toBe(false);
  });
});

describe("handleCallback", () => {
  it("exchanges the code, gets a long-lived token and returns each Page with its Instagram account", async () => {
    const { fetch, callback } = setup();
    const accounts = await callback();

    const [exchangeUrl, exchangeInit] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(exchangeUrl).toBe(TOKEN_URL); // secrets go in the POST body, never in the URL
    expect(exchangeInit.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(String(exchangeInit.body)))).toMatchObject({
      client_id: "1804672957308377",
      client_secret: "app-secret",
      code: "auth-code",
      code_verifier: "verifier",
      redirect_uri: REDIRECT,
    });
    const longInit = (fetch.mock.calls[1] as unknown as [string, RequestInit])[1];
    expect(new URLSearchParams(String(longInit.body)).get("fb_exchange_token")).toBe("EAAshort-fixture");

    const accountsCall = fetch.mock.calls.find(([input]) => String(input).includes("/me/accounts")) as unknown as [string, RequestInit];
    expect(accountsCall[1].headers).toMatchObject({ Authorization: "Bearer EAAlong-fixture" });

    const pageTokens = {
      refreshToken: "EAAlong-fixture",
      expiresAt: null,
      refreshExpiresAt: new Date(NOW.getTime() + 5_184_000 * 1000),
      scopes: [...META_SCOPES],
    };
    expect(accounts).toEqual([
      {
        platform: "facebook",
        externalId: "1000000000000001",
        name: "Empresas al Filo",
        handle: "empresasalfilo",
        avatarUrl: "https://scontent.xx.fbcdn.net/fixture-page.jpg",
        tokens: { accessToken: "EAApage-fixture-1", ...pageTokens },
      },
      {
        platform: "instagram",
        externalId: "17841400000000001",
        name: "casiquiebra",
        handle: "casiquiebra",
        avatarUrl: "https://scontent.xx.fbcdn.net/fixture-ig.jpg",
        parentExternalId: "1000000000000001",
        tokens: { accessToken: "EAApage-fixture-1", ...pageTokens },
      },
      {
        platform: "facebook",
        externalId: "1000000000000002",
        name: "Página sin Instagram",
        handle: null,
        avatarUrl: "https://scontent.xx.fbcdn.net/fixture-page2.jpg",
        tokens: { accessToken: "EAApage-fixture-2", ...pageTokens },
      },
    ]);
  });

  it("fails with missing_scopes when a permission was declined", async () => {
    const declined = { data: permissions.data.map((p) => (p.permission === "read_insights" ? { ...p, status: "declined" } : p)) };
    const { callback } = setup({ permissions: () => json(declined) });
    await expect(callback()).rejects.toMatchObject({ code: "missing_scopes" });
  });

  it("fails with no_pages and safe counts when no Page was shared", async () => {
    const { callback } = setup({ accounts: () => json({ data: [] }) });
    const error = (await callback().catch((e: unknown) => e)) as ConnectorError;
    expect(error.code).toBe("no_pages");
    expect(error.message).toBe("no usable Pages (accounts=0, without_token=0, business_management=false, businesses=0, business_pages=0)");
  });

  it("finds Pages owned by a business portfolio when /me/accounts is empty", async () => {
    const { callback } = setup({
      permissions: () => json(withBusinessManagement),
      accounts: () => json({ data: [] }),
      businesses: () => json({ data: [{ id: "555" }] }),
      ownedPages: () => json({ data: accountsPage1.data }),
    });
    const accounts = await callback();
    expect(accounts.map((account) => [account.platform, account.externalId])).toEqual([
      ["facebook", "1000000000000001"],
      ["instagram", "17841400000000001"],
    ]);
  });

  it("does not look up businesses when Pages already came back", async () => {
    const { fetch, callback } = setup({ permissions: () => json(withBusinessManagement) });
    await callback();
    expect(fetch.mock.calls.some(([input]) => String(input).includes("/me/businesses"))).toBe(false);
  });

  it("reports a rejected code without leaking Meta's message", async () => {
    const { callback } = setup({ exchange: () => json(invalidCode, 400) });
    const error = (await callback().catch((e: unknown) => e)) as ConnectorError;
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error.code).toBe("token_exchange_failed");
    expect(error.message).toContain("OAuthException:100:36009");
    expect(error.message).not.toContain("secret");
  });

  it("maps a Graph failure while listing Pages to accounts_lookup_failed", async () => {
    const { callback } = setup({ accounts: () => json({ error: { type: "OAuthException", code: 190 } }, 400) });
    await expect(callback()).rejects.toMatchObject({ code: "accounts_lookup_failed" });
  });
});

describe("refresh", () => {
  it("has no refresh grant: the account must be reconnected", async () => {
    await expect(setup().connector.refresh("EAAlong-fixture")).rejects.toBeInstanceOf(RefreshRejectedError);
  });
});
