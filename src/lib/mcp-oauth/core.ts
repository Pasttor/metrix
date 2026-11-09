import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * A minimal OAuth 2.1 authorization server so Claude can connect to the
 * Metrix MCP server: public clients with PKCE (S256), registered by DCR
 * (RFC 7591) or identified by a Client ID Metadata Document (CIMD). Only the
 * allowed user approves (the consent page sits behind the Metrix login).
 * Codes and tokens are random and stored as SHA-256 hashes.
 */

export const MCP_SCOPE = "metrix";
export const ACCESS_TOKEN_TTL_S = 60 * 60;
export const REFRESH_TOKEN_TTL_S = 90 * 86_400;
export const CODE_TTL_S = 10 * 60;

/** Claude's hosted apps (web, desktop, mobile). claude.com is listed because Anthropic may move it there. */
export const HOSTED_REDIRECTS = ["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"];
/** CIMD documents are fetched only from these hosts (no SSRF to arbitrary URLs). */
export const CIMD_HOSTS = ["claude.ai", "claude.com", "www.claude.com"];

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type OAuthClient = { id: string; kind: "dcr" | "cimd"; name: string | null; redirectUris: string[] };
export type CodeRecord = { clientId: string; redirectUri: string; codeChallenge: string; scope: string; expiresAt: Date };
export type TokenRecord = { kind: "access" | "refresh"; grantId: string; expiresAt: Date; revoked: boolean; grantRevoked: boolean; clientId: string; scope: string };

export interface OAuthStore {
  getClient(id: string): Promise<OAuthClient | null>;
  saveClient(client: OAuthClient): Promise<void>;
  saveCode(hash: string, code: CodeRecord): Promise<void>;
  /** Marks the code used and returns it, only the first time (atomic). */
  consumeCode(hash: string): Promise<CodeRecord | null>;
  createGrant(input: { clientId: string; clientName: string | null; scope: string }): Promise<string>;
  saveToken(hash: string, token: { kind: "access" | "refresh"; grantId: string; expiresAt: Date }): Promise<void>;
  findToken(hash: string): Promise<TokenRecord | null>;
  revokeToken(hash: string): Promise<void>;
  revokeGrant(grantId: string): Promise<void>;
  touchGrant(grantId: string, at: Date): Promise<void>;
}

export class OAuthError extends Error {
  constructor(
    readonly error: string,
    readonly description: string,
    readonly status = 400,
  ) {
    super(description);
    this.name = "OAuthError";
  }
}

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const random = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;

/** PKCE S256: BASE64URL(SHA256(verifier)) === challenge, in constant time. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const computed = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const expected = Buffer.from(challenge);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLoopback(url: URL): boolean {
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname === "::1" ? "[::1]" : url.hostname);
}

/** Redirects Metrix accepts at all: Claude's hosted callback or a loopback (Claude Code, local tools). */
export function isAcceptableRedirect(uri: string): boolean {
  if (HOSTED_REDIRECTS.includes(uri)) return true;
  const url = parseUrl(uri);
  return url !== null && isLoopback(url) && !url.username && !url.password && !url.hash;
}

/** Exact match, except that loopback redirects match on any port (RFC 8252 §7.3). */
export function redirectMatches(registered: string[], uri: string): boolean {
  if (registered.includes(uri)) return true;
  const target = parseUrl(uri);
  if (!target || !isLoopback(target)) return false;
  return registered.some((candidate) => {
    const url = parseUrl(candidate);
    return url !== null && isLoopback(url) && url.hostname === target.hostname && url.pathname === target.pathname && url.search === target.search;
  });
}

const registrationSchema = z.object({
  redirect_uris: z.array(z.string()).min(1).max(10),
  client_name: z.string().max(200).optional(),
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
});

/** RFC 7591 dynamic registration of a public client. */
export async function registerClient(store: OAuthStore, body: unknown, now: Date) {
  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) throw new OAuthError("invalid_client_metadata", "redirect_uris is required.");
  const metadata = parsed.data;
  if (metadata.token_endpoint_auth_method && metadata.token_endpoint_auth_method !== "none") {
    throw new OAuthError("invalid_client_metadata", "Only public clients (token_endpoint_auth_method=none) are supported.");
  }
  const rejected = metadata.redirect_uris.find((uri) => !isAcceptableRedirect(uri));
  if (rejected) throw new OAuthError("invalid_redirect_uri", "Only Claude's callback or a loopback redirect is allowed.");

  const client: OAuthClient = { id: random("mtx_client_"), kind: "dcr", name: metadata.client_name ?? null, redirectUris: metadata.redirect_uris };
  await store.saveClient(client);
  return {
    client_id: client.id,
    client_id_issued_at: Math.floor(now.getTime() / 1000),
    client_name: client.name ?? undefined,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}

const cimdSchema = z.object({ client_id: z.string(), client_name: z.string().optional(), redirect_uris: z.array(z.string()).min(1) });

/** A CIMD client: its id is an https URL on a Claude host serving its own metadata. */
async function fetchCimdClient(clientId: string, fetchFn: typeof fetch): Promise<OAuthClient> {
  const url = parseUrl(clientId);
  if (!url || url.protocol !== "https:" || !CIMD_HOSTS.includes(url.hostname)) throw new OAuthError("invalid_client", "Unknown client.");
  const response = await fetchFn(url.toString(), { headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!response?.ok) throw new OAuthError("invalid_client", "Could not read the client metadata document.");
  const parsed = cimdSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success || parsed.data.client_id !== clientId) throw new OAuthError("invalid_client", "Invalid client metadata document.");
  return { id: clientId, kind: "cimd", name: parsed.data.client_name ?? null, redirectUris: parsed.data.redirect_uris.filter(isAcceptableRedirect) };
}

export async function resolveClient(store: OAuthStore, clientId: string, fetchFn: typeof fetch = fetch): Promise<OAuthClient> {
  if (clientId.startsWith("https://")) {
    // CIMD documents can change: read them on every authorization, then remember them for the token endpoint.
    const client = await fetchCimdClient(clientId, fetchFn);
    await store.saveClient(client);
    return client;
  }
  const client = await store.getClient(clientId);
  if (!client) throw new OAuthError("invalid_client", "Unknown client.");
  return client;
}

export type AuthorizeRequest = {
  clientId: string;
  redirectUri: string;
  responseType: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string | null;
  scope: string | null;
  resource: string | null;
};

export function readAuthorizeRequest(params: URLSearchParams | Record<string, string | string[] | undefined>): AuthorizeRequest {
  const get = (key: string) => {
    const value = params instanceof URLSearchParams ? params.get(key) : params[key];
    return (Array.isArray(value) ? value[0] : value) ?? null;
  };
  return {
    clientId: get("client_id") ?? "",
    redirectUri: get("redirect_uri") ?? "",
    responseType: get("response_type") ?? "",
    codeChallenge: get("code_challenge") ?? "",
    codeChallengeMethod: get("code_challenge_method") ?? "",
    state: get("state"),
    scope: get("scope"),
    resource: get("resource"),
  };
}

/**
 * Checks an authorization request. Errors before the redirect is trusted are
 * shown on the page (`redirect: false`); later ones go back to the client.
 */
export async function validateAuthorizeRequest(
  store: OAuthStore,
  request: AuthorizeRequest,
  resourceUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; client: OAuthClient } | { ok: false; redirect: boolean; error: string; description: string }> {
  let client: OAuthClient;
  try {
    client = await resolveClient(store, request.clientId, fetchFn);
  } catch (error) {
    return { ok: false, redirect: false, error: "invalid_client", description: error instanceof OAuthError ? error.description : "Unknown client." };
  }
  if (!request.redirectUri || !redirectMatches(client.redirectUris, request.redirectUri) || !isAcceptableRedirect(request.redirectUri)) {
    return { ok: false, redirect: false, error: "invalid_request", description: "The redirect_uri is not registered for this client." };
  }
  if (request.responseType !== "code") return { ok: false, redirect: true, error: "unsupported_response_type", description: "Only response_type=code." };
  if (request.codeChallengeMethod !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(request.codeChallenge)) {
    return { ok: false, redirect: true, error: "invalid_request", description: "PKCE with S256 is required." };
  }
  if (request.resource && request.resource.replace(/\/$/, "") !== resourceUrl) {
    return { ok: false, redirect: true, error: "invalid_target", description: "Unknown resource." };
  }
  return { ok: true, client };
}

export function redirectWith(redirectUri: string, params: Record<string, string | null>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) if (value !== null) url.searchParams.set(key, value);
  return url.toString();
}

/** After the user approves: a one-time code bound to the client, redirect and PKCE challenge. */
export async function issueCode(store: OAuthStore, request: AuthorizeRequest, now: Date): Promise<string> {
  const code = random("mtx_code_");
  await store.saveCode(sha256(code), {
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    scope: MCP_SCOPE,
    expiresAt: new Date(now.getTime() + CODE_TTL_S * 1000),
  });
  return code;
}

export type TokenResponse = { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: string };

async function issueTokens(store: OAuthStore, grantId: string, scope: string, now: Date): Promise<TokenResponse> {
  const access = random("mtx_at_");
  const refresh = random("mtx_rt_");
  await store.saveToken(sha256(access), { kind: "access", grantId, expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_S * 1000) });
  await store.saveToken(sha256(refresh), { kind: "refresh", grantId, expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_S * 1000) });
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_S, refresh_token: refresh, scope };
}

/** The token endpoint (form-encoded body already parsed). */
export async function exchangeToken(store: OAuthStore, form: URLSearchParams, now: Date): Promise<TokenResponse> {
  const grantType = form.get("grant_type");
  const clientId = form.get("client_id") ?? "";

  if (grantType === "authorization_code") {
    const code = form.get("code") ?? "";
    const verifier = form.get("code_verifier") ?? "";
    const record = code ? await store.consumeCode(sha256(code)) : null;
    if (!record || record.expiresAt <= now) throw new OAuthError("invalid_grant", "The authorization code is invalid or expired.");
    if (record.clientId !== clientId) throw new OAuthError("invalid_grant", "The code was issued to another client.");
    if (record.redirectUri !== form.get("redirect_uri")) throw new OAuthError("invalid_grant", "redirect_uri does not match.");
    if (!verifyPkce(verifier, record.codeChallenge)) throw new OAuthError("invalid_grant", "PKCE verification failed.");
    const client = await store.getClient(clientId);
    if (!client) throw new OAuthError("invalid_client", "Unknown client.", 401);
    const grantId = await store.createGrant({ clientId, clientName: client.name, scope: record.scope });
    return issueTokens(store, grantId, record.scope, now);
  }

  if (grantType === "refresh_token") {
    const token = form.get("refresh_token") ?? "";
    const hash = sha256(token);
    const record = token ? await store.findToken(hash) : null;
    if (!record || record.kind !== "refresh" || record.grantRevoked || record.expiresAt <= now) {
      throw new OAuthError("invalid_grant", "The refresh token is invalid or expired.");
    }
    if (record.revoked) {
      // A rotated token used again: it may have leaked, so the whole grant goes.
      await store.revokeGrant(record.grantId);
      throw new OAuthError("invalid_grant", "The refresh token was already used.");
    }
    if (clientId && record.clientId !== clientId) throw new OAuthError("invalid_grant", "The token was issued to another client.");
    await store.revokeToken(hash);
    return issueTokens(store, record.grantId, record.scope, now);
  }

  throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

export type VerifiedToken = { token: string; clientId: string; scopes: string[]; expiresAt: number; grantId: string };

/** Bearer check for the MCP endpoint. */
export async function verifyAccessToken(store: OAuthStore, token: string | undefined, now: Date): Promise<VerifiedToken | undefined> {
  if (!token || !token.startsWith("mtx_at_")) return undefined;
  const record = await store.findToken(sha256(token));
  if (!record || record.kind !== "access" || record.revoked || record.grantRevoked || record.expiresAt <= now) return undefined;
  await store.touchGrant(record.grantId, now).catch(() => undefined);
  return { token, clientId: record.clientId, scopes: record.scope.split(" "), expiresAt: Math.floor(record.expiresAt.getTime() / 1000), grantId: record.grantId };
}

/** RFC 8414 metadata. Advertising CIMD and "none" lets Claude skip registration. */
export function authorizationServerMetadata(appUrl: string) {
  return {
    issuer: appUrl,
    authorization_endpoint: `${appUrl}/oauth/authorize`,
    token_endpoint: `${appUrl}/api/oauth/token`,
    registration_endpoint: `${appUrl}/api/oauth/register`,
    scopes_supported: [MCP_SCOPE],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    client_id_metadata_document_supported: true,
  };
}

/** RFC 9728 metadata for the MCP endpoint. */
export function protectedResourceMetadata(appUrl: string) {
  return {
    resource: `${appUrl}/api/mcp`,
    authorization_servers: [appUrl],
    bearer_methods_supported: ["header"],
    scopes_supported: [MCP_SCOPE],
    resource_name: "Metrix",
  };
}
