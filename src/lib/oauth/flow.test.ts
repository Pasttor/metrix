import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { ConnectorError, type ConnectedAccount, type PlatformConnector } from "./connector";
import { finishConnect, startConnect, type ConnectDeps } from "./flow";
import type { OAuthStateRow, OAuthStateStore } from "./state";

const APP = "http://localhost:3000";
const SECRET_ACCESS = "ya29.SECRET-ACCESS-TOKEN";
const SECRET_REFRESH = "1//SECRET-REFRESH-TOKEN";
const AUTH_CODE = "4/SECRET-AUTH-CODE";

function memoryStateStore(): OAuthStateStore & { rows: Map<string, OAuthStateRow> } {
  const rows = new Map<string, OAuthStateRow>();
  return {
    rows,
    async insert(row) {
      rows.set(row.state, row);
    },
    async take(state) {
      const row = rows.get(state) ?? null;
      rows.delete(state);
      return row;
    },
    async purge() {},
  };
}

function fakeConnector(overrides: Partial<PlatformConnector> = {}): PlatformConnector {
  return {
    platform: "youtube",
    buildAuthUrl: ({ state, codeChallenge, redirectUri }) =>
      `https://accounts.example.com/auth?state=${state}&code_challenge=${codeChallenge}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    handleCallback: async (): Promise<ConnectedAccount[]> => [
      {
        platform: "youtube",
        externalId: "UC123",
        name: "Mi canal",
        tokens: { accessToken: SECRET_ACCESS, refreshToken: SECRET_REFRESH, expiresAt: new Date() },
      },
    ],
    refresh: async () => ({ accessToken: SECRET_ACCESS }),
    ...overrides,
  };
}

function deps(overrides: Partial<ConnectDeps> = {}) {
  const stateStore = memoryStateStore();
  const saveConnection = vi.fn<(accounts: ConnectedAccount[]) => Promise<void>>().mockResolvedValue();
  const log = vi.fn();
  const value: ConnectDeps = {
    appUrl: APP,
    isAuthorized: async () => true,
    getConnector: () => fakeConnector(),
    stateStore,
    saveConnection,
    log,
    ...overrides,
  };
  return { deps: value, stateStore, saveConnection, log };
}

async function responseText(response: Response): Promise<string> {
  const headers = JSON.stringify([...response.headers.entries()]);
  const body = await response.clone().text();
  return `${headers}\n${body}`;
}

/** Starts a flow and returns the state the provider would send back. */
async function begin(d: ConnectDeps): Promise<string> {
  const response = await startConnect("youtube", d);
  return new URL(response.headers.get("location")!).searchParams.get("state")!;
}

let consoleSpies: MockInstance[] = [];

beforeEach(() => {
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
});

afterEach(() => {
  consoleSpies.forEach((spy) => spy.mockRestore());
});

function loggedText(log: ReturnType<typeof vi.fn>): string {
  return JSON.stringify([log.mock.calls, ...consoleSpies.map((spy) => spy.mock.calls)]);
}

describe("startConnect", () => {
  it("redirects to the provider with state, PKCE challenge and the callback URL", async () => {
    const { deps: d, stateStore } = deps();
    const response = await startConnect("youtube", d);
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(307);
    expect(location.origin).toBe("https://accounts.example.com");
    expect(location.searchParams.get("redirect_uri")).toBe(`${APP}/api/connect/youtube/callback`);
    expect(stateStore.rows.size).toBe(1);
  });

  it("sends visitors without the allowed session to /login", async () => {
    const { deps: d, stateStore } = deps({ isAuthorized: async () => false });
    const response = await startConnect("youtube", d);
    expect(response.headers.get("location")).toBe(`${APP}/login`);
    expect(stateStore.rows.size).toBe(0);
  });

  it("returns 404 for unknown platforms", async () => {
    const { deps: d } = deps();
    expect((await startConnect("myspace", d)).status).toBe(404);
  });

  it("explains when the platform has no credentials yet", async () => {
    const { deps: d } = deps({ getConnector: () => null });
    const response = await startConnect("tiktok", d);
    expect(response.headers.get("location")).toBe(`${APP}/settings/connections?error=not_configured&platform=tiktok`);
  });
});

describe("finishConnect", () => {
  it("saves the accounts and redirects with a success flag", async () => {
    const { deps: d, saveConnection } = deps();
    const state = await begin(d);
    const response = await finishConnect("youtube", new URLSearchParams({ state, code: AUTH_CODE }), d);

    expect(response.headers.get("location")).toBe(`${APP}/settings/connections?connected=youtube`);
    expect(saveConnection).toHaveBeenCalledOnce();
    expect(saveConnection.mock.calls[0][0][0].tokens.accessToken).toBe(SECRET_ACCESS);
  });

  it("passes the stored PKCE verifier to the connector", async () => {
    const handleCallback = vi.fn().mockResolvedValue([]);
    const { deps: d, stateStore } = deps({ getConnector: () => fakeConnector({ handleCallback }) });
    const state = await begin(d);
    const verifier = stateStore.rows.get(state)!.code_verifier;

    await finishConnect("youtube", new URLSearchParams({ state, code: AUTH_CODE }), d);
    expect(handleCallback).toHaveBeenCalledWith(expect.objectContaining({ code: AUTH_CODE, codeVerifier: verifier }));
  });

  it("rejects a reused state", async () => {
    const { deps: d, saveConnection } = deps();
    const state = await begin(d);
    await finishConnect("youtube", new URLSearchParams({ state, code: AUTH_CODE }), d);
    const second = await finishConnect("youtube", new URLSearchParams({ state, code: AUTH_CODE }), d);

    expect(second.headers.get("location")).toBe(`${APP}/settings/connections?error=state&platform=youtube`);
    expect(saveConnection).toHaveBeenCalledOnce();
  });

  it("handles a denied consent", async () => {
    const { deps: d, saveConnection } = deps();
    const state = await begin(d);
    const response = await finishConnect("youtube", new URLSearchParams({ state, error: "access_denied" }), d);
    expect(response.headers.get("location")).toBe(`${APP}/settings/connections?error=denied&platform=youtube`);
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it("surfaces a connector error code", async () => {
    const handleCallback = vi.fn().mockRejectedValue(new ConnectorError("no_refresh_token"));
    const { deps: d } = deps({ getConnector: () => fakeConnector({ handleCallback }) });
    const state = await begin(d);
    const response = await finishConnect("youtube", new URLSearchParams({ state, code: AUTH_CODE }), d);
    expect(response.headers.get("location")).toBe(
      `${APP}/settings/connections?error=no_refresh_token&platform=youtube`,
    );
  });
});

describe("no token leaks", () => {
  it("never puts tokens or the auth code in responses or logs, on success", async () => {
    const { deps: d, log } = deps();
    const state = await begin(d);
    const response = await finishConnect("youtube", new URLSearchParams({ state, code: AUTH_CODE }), d);
    const text = (await responseText(response)) + loggedText(log);

    for (const secret of [SECRET_ACCESS, SECRET_REFRESH, AUTH_CODE]) expect(text).not.toContain(secret);
    expect(text).not.toMatch(/access_token|refresh_token|accessToken|refreshToken/);
  });

  it("never echoes provider error details that contain secrets", async () => {
    const leaky = new Error(`invalid_grant for ${AUTH_CODE} with token ${SECRET_ACCESS}`);
    const handleCallback = vi.fn().mockRejectedValue(leaky);
    const { deps: d, log } = deps({ getConnector: () => fakeConnector({ handleCallback }) });
    const state = await begin(d);
    const response = await finishConnect("youtube", new URLSearchParams({ state, code: AUTH_CODE }), d);
    const text = (await responseText(response)) + loggedText(log);

    expect(response.headers.get("location")).toContain("error=callback_failed");
    for (const secret of [SECRET_ACCESS, AUTH_CODE]) expect(text).not.toContain(secret);
  });

  it("returns JSON without token fields for unknown platforms", async () => {
    const { deps: d } = deps();
    const body = await (await finishConnect("myspace", new URLSearchParams({ code: AUTH_CODE }), d)).json();
    expect(JSON.stringify(body)).not.toMatch(/token|SECRET/i);
  });
});
