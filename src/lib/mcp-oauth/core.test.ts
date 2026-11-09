import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  authorizationServerMetadata,
  exchangeToken,
  isAcceptableRedirect,
  issueCode,
  protectedResourceMetadata,
  readAuthorizeRequest,
  redirectMatches,
  registerClient,
  validateAuthorizeRequest,
  verifyAccessToken,
  verifyPkce,
  type CodeRecord,
  type OAuthClient,
  type OAuthStore,
  type TokenRecord,
} from "./core";

const NOW = new Date("2026-11-09T12:00:00Z");
const APP = "https://metrix-swart-mu.vercel.app";
const RESOURCE = `${APP}/api/mcp`;
const CLAUDE = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

function memoryStore() {
  const clients = new Map<string, OAuthClient>();
  const codes = new Map<string, CodeRecord & { used: boolean }>();
  const grants = new Map<string, { clientId: string; scope: string; revoked: boolean; lastUsed?: Date }>();
  const tokens = new Map<string, { kind: "access" | "refresh"; grantId: string; expiresAt: Date; revoked: boolean }>();
  const store: OAuthStore = {
    getClient: async (id) => clients.get(id) ?? null,
    saveClient: async (client) => void clients.set(client.id, client),
    saveCode: async (hash, code) => void codes.set(hash, { ...code, used: false }),
    consumeCode: async (hash) => {
      const code = codes.get(hash);
      if (!code || code.used) return null;
      code.used = true;
      return code;
    },
    createGrant: async ({ clientId, scope }) => {
      const id = `grant-${grants.size + 1}`;
      grants.set(id, { clientId, scope, revoked: false });
      return id;
    },
    saveToken: async (hash, token) => void tokens.set(hash, { ...token, revoked: false }),
    findToken: async (hash): Promise<TokenRecord | null> => {
      const token = tokens.get(hash);
      if (!token) return null;
      const grant = grants.get(token.grantId)!;
      return { ...token, grantRevoked: grant.revoked, clientId: grant.clientId, scope: grant.scope };
    },
    revokeToken: async (hash) => void (tokens.get(hash)!.revoked = true),
    revokeGrant: async (grantId) => {
      grants.get(grantId)!.revoked = true;
      for (const token of tokens.values()) if (token.grantId === grantId) token.revoked = true;
    },
    touchGrant: async (grantId, at) => void (grants.get(grantId)!.lastUsed = at),
  };
  return { store, clients, grants, tokens };
}

function authorizeParams(clientId: string, overrides: Record<string, string> = {}) {
  return readAuthorizeRequest(
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: CLAUDE,
      response_type: "code",
      code_challenge: CHALLENGE,
      code_challenge_method: "S256",
      state: "xyz",
      scope: "metrix",
      resource: RESOURCE,
      ...overrides,
    }),
  );
}

async function registered(store: OAuthStore) {
  return (await registerClient(store, { redirect_uris: [CLAUDE], client_name: "Claude", token_endpoint_auth_method: "none" }, NOW)).client_id;
}

async function tokensFor(store: OAuthStore) {
  const clientId = await registered(store);
  const code = await issueCode(store, authorizeParams(clientId), NOW);
  const tokens = await exchangeToken(
    store,
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: CLAUDE, client_id: clientId, code_verifier: VERIFIER }),
    NOW,
  );
  return { clientId, tokens };
}

describe("redirects", () => {
  it("accepts Claude's hosted callback and loopback only", () => {
    expect(isAcceptableRedirect(CLAUDE)).toBe(true);
    expect(isAcceptableRedirect("https://claude.com/api/mcp/auth_callback")).toBe(true);
    expect(isAcceptableRedirect("http://localhost:3118/callback")).toBe(true);
    expect(isAcceptableRedirect("http://127.0.0.1:50000/callback")).toBe(true);
    expect(isAcceptableRedirect("https://evil.example/callback")).toBe(false);
    expect(isAcceptableRedirect("http://claude.ai/api/mcp/auth_callback")).toBe(false);
  });

  it("matches loopback redirects on any port, others exactly", () => {
    expect(redirectMatches(["http://localhost/callback"], "http://localhost:3118/callback")).toBe(true);
    expect(redirectMatches(["http://127.0.0.1/callback"], "http://127.0.0.1:9/callback")).toBe(true);
    expect(redirectMatches(["http://localhost/callback"], "http://localhost:3118/other")).toBe(false);
    expect(redirectMatches([CLAUDE], `${CLAUDE}?x=1`)).toBe(false);
  });
});

describe("registration", () => {
  it("registers a public client with Claude's callback", async () => {
    const { store, clients } = memoryStore();
    const response = await registerClient(store, { redirect_uris: [CLAUDE], client_name: "Claude" }, NOW);
    expect(response).toMatchObject({ redirect_uris: [CLAUDE], token_endpoint_auth_method: "none", client_name: "Claude" });
    expect(clients.get(response.client_id)?.kind).toBe("dcr");
  });

  it("rejects foreign redirects and confidential clients", async () => {
    const { store } = memoryStore();
    await expect(registerClient(store, { redirect_uris: ["https://evil.example/cb"] }, NOW)).rejects.toMatchObject({ error: "invalid_redirect_uri" });
    await expect(registerClient(store, { redirect_uris: [CLAUDE], token_endpoint_auth_method: "client_secret_basic" }, NOW)).rejects.toMatchObject({ error: "invalid_client_metadata" });
    await expect(registerClient(store, {}, NOW)).rejects.toMatchObject({ error: "invalid_client_metadata" });
  });
});

describe("authorization request", () => {
  it("accepts a registered client with PKCE", async () => {
    const { store } = memoryStore();
    const clientId = await registered(store);
    expect(await validateAuthorizeRequest(store, authorizeParams(clientId), RESOURCE)).toMatchObject({ ok: true });
  });

  it("shows unknown clients and redirects on the page, never sending them anywhere", async () => {
    const { store } = memoryStore();
    expect(await validateAuthorizeRequest(store, authorizeParams("nope"), RESOURCE)).toMatchObject({ ok: false, redirect: false });
    const clientId = await registered(store);
    expect(await validateAuthorizeRequest(store, authorizeParams(clientId, { redirect_uri: "https://evil.example/cb" }), RESOURCE)).toMatchObject({ ok: false, redirect: false });
  });

  it("sends protocol errors back to the client", async () => {
    const { store } = memoryStore();
    const clientId = await registered(store);
    expect(await validateAuthorizeRequest(store, authorizeParams(clientId, { code_challenge_method: "plain" }), RESOURCE)).toMatchObject({ ok: false, redirect: true, error: "invalid_request" });
    expect(await validateAuthorizeRequest(store, authorizeParams(clientId, { resource: "https://other.example/mcp" }), RESOURCE)).toMatchObject({ ok: false, redirect: true, error: "invalid_target" });
  });

  it("reads CIMD clients only from Claude hosts", async () => {
    const { store } = memoryStore();
    const cimd = "https://claude.ai/oauth/claude-code-client-metadata";
    const fetch = vi.fn(async () => new Response(JSON.stringify({ client_id: cimd, client_name: "Claude Code", redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"] })));
    const ok = await validateAuthorizeRequest(store, authorizeParams(cimd, { redirect_uri: "http://localhost:4567/callback" }), RESOURCE, fetch as unknown as typeof globalThis.fetch);
    expect(ok).toMatchObject({ ok: true, client: { kind: "cimd", name: "Claude Code" } });

    const evil = await validateAuthorizeRequest(store, authorizeParams("https://evil.example/meta.json"), RESOURCE, fetch as unknown as typeof globalThis.fetch);
    expect(evil).toMatchObject({ ok: false, redirect: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("token endpoint", () => {
  it("exchanges a code once, with the right verifier", async () => {
    const { store } = memoryStore();
    const clientId = await registered(store);
    const code = await issueCode(store, authorizeParams(clientId), NOW);
    const form = (verifier: string) => new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: CLAUDE, client_id: clientId, code_verifier: verifier });

    await expect(exchangeToken(store, form("x".repeat(43)), NOW)).rejects.toMatchObject({ error: "invalid_grant" });
    // The failed attempt consumed the code: it can never be replayed.
    await expect(exchangeToken(store, form(VERIFIER), NOW)).rejects.toMatchObject({ error: "invalid_grant" });

    const fresh = await issueCode(store, authorizeParams(clientId), NOW);
    const tokens = await exchangeToken(store, new URLSearchParams({ grant_type: "authorization_code", code: fresh, redirect_uri: CLAUDE, client_id: clientId, code_verifier: VERIFIER }), NOW);
    expect(tokens).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "metrix" });
    expect(tokens.access_token).toMatch(/^mtx_at_/);
  });

  it("rejects expired codes and mismatched redirects", async () => {
    const { store } = memoryStore();
    const clientId = await registered(store);
    const code = await issueCode(store, authorizeParams(clientId), NOW);
    const later = new Date(NOW.getTime() + 11 * 60_000);
    await expect(
      exchangeToken(store, new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: CLAUDE, client_id: clientId, code_verifier: VERIFIER }), later),
    ).rejects.toMatchObject({ error: "invalid_grant" });
    const other = await issueCode(store, authorizeParams(clientId), NOW);
    await expect(
      exchangeToken(store, new URLSearchParams({ grant_type: "authorization_code", code: other, redirect_uri: "http://localhost/callback", client_id: clientId, code_verifier: VERIFIER }), NOW),
    ).rejects.toMatchObject({ error: "invalid_grant" });
  });

  it("rotates refresh tokens and revokes the grant when an old one is reused", async () => {
    const { store } = memoryStore();
    const { clientId, tokens } = await tokensFor(store);
    const refreshed = await exchangeToken(store, new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId }), NOW);
    expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);
    expect(await verifyAccessToken(store, refreshed.access_token, NOW)).toBeDefined();

    await expect(exchangeToken(store, new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId }), NOW)).rejects.toMatchObject({ error: "invalid_grant" });
    // Reuse detected: every token of the grant stops working.
    expect(await verifyAccessToken(store, refreshed.access_token, NOW)).toBeUndefined();
    await expect(exchangeToken(store, new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshed.refresh_token }), NOW)).rejects.toMatchObject({ error: "invalid_grant" });
  });

  it("rejects unknown grant types", async () => {
    const { store } = memoryStore();
    await expect(exchangeToken(store, new URLSearchParams({ grant_type: "password" }), NOW)).rejects.toMatchObject({ error: "unsupported_grant_type" });
  });
});

describe("access tokens", () => {
  it("verifies live tokens and records use", async () => {
    const { store, grants } = memoryStore();
    const { tokens } = await tokensFor(store);
    expect(await verifyAccessToken(store, tokens.access_token, NOW)).toMatchObject({ scopes: ["metrix"] });
    expect(grants.get("grant-1")?.lastUsed).toEqual(NOW);
  });

  it("rejects expired, unknown and refresh tokens", async () => {
    const { store } = memoryStore();
    const { tokens } = await tokensFor(store);
    expect(await verifyAccessToken(store, tokens.access_token, new Date(NOW.getTime() + 3601_000))).toBeUndefined();
    expect(await verifyAccessToken(store, "mtx_at_unknown", NOW)).toBeUndefined();
    expect(await verifyAccessToken(store, tokens.refresh_token, NOW)).toBeUndefined();
    expect(await verifyAccessToken(store, undefined, NOW)).toBeUndefined();
  });
});

describe("PKCE and metadata", () => {
  it("checks the S256 verifier", () => {
    expect(verifyPkce(VERIFIER, CHALLENGE)).toBe(true);
    expect(verifyPkce(VERIFIER.replace("d", "e"), CHALLENGE)).toBe(false);
    expect(verifyPkce("short", CHALLENGE)).toBe(false);
  });

  it("advertises what Claude needs", () => {
    expect(authorizationServerMetadata(APP)).toMatchObject({
      issuer: APP,
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      client_id_metadata_document_supported: true,
      registration_endpoint: `${APP}/api/oauth/register`,
    });
    expect(protectedResourceMetadata(APP)).toMatchObject({ resource: RESOURCE, authorization_servers: [APP] });
  });
});
