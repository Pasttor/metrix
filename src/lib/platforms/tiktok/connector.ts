import { ConnectorError, type ConnectedAccount, type PlatformConnector } from "@/lib/oauth/connector";
import { RefreshRejectedError } from "@/lib/oauth/token-store";
import type { OAuthTokens } from "@/lib/oauth/types";
import { errorCode, fetchWithRetry, HttpError, parseJson, type FetchFn, type RetryOptions } from "@/lib/platforms/http";
import { createTikTokClient, userFieldsFor } from "./client";
import { tiktokTokenSchema, type TikTokToken } from "./schemas";

export const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
export const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

/** Read-only scopes (Display API through Login Kit). */
export const TIKTOK_SCOPES = ["user.info.basic", "user.info.profile", "user.info.stats", "video.list"] as const;
/** Content Posting API, only while the app has it (the Sandbox does; Production after its own review). */
export const TIKTOK_PUBLISH_SCOPES = ["video.publish"] as const;
/** Without these nothing useful can be synced. */
const REQUIRED_SCOPES = ["user.info.basic"];

export type TikTokConnectorConfig = {
  clientKey: string;
  clientSecret: string;
  /** Also ask for the publishing scopes (TIKTOK_PUBLISH=true). */
  publish?: boolean;
  fetch?: FetchFn;
  retry?: RetryOptions;
  now?: () => Date;
};

export function grantedScopes(token: Pick<TikTokToken, "scope">): string[] {
  return (token.scope ?? "").split(/[,\s]+/).filter(Boolean);
}

/** Scopes Metrix asked for that the user did not grant (shown on the connection card). */
export function missingScopes(granted: string[]): string[] {
  return TIKTOK_SCOPES.filter((scope) => !granted.includes(scope));
}

function toTokens(token: TikTokToken, now: Date): OAuthTokens {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: new Date(now.getTime() + token.expires_in * 1000),
    refreshExpiresAt: token.refresh_expires_in ? new Date(now.getTime() + token.refresh_expires_in * 1000) : null,
    scopes: grantedScopes(token),
  };
}

/**
 * TikTok Login Kit for web. The server keeps the client secret, so PKCE is
 * not used (TikTok expects it only for desktop/mobile apps, hex-encoded); the
 * OAuth state still protects the callback.
 */
export function createTikTokConnector(config: TikTokConnectorConfig): PlatformConnector {
  const fetchFn = config.fetch ?? fetch;
  const now = config.now ?? (() => new Date());

  async function tokenRequest(params: Record<string, string>): Promise<Response> {
    return fetchWithRetry(
      fetchFn,
      TIKTOK_TOKEN_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "Cache-Control": "no-cache" },
        body: new URLSearchParams({ client_key: config.clientKey, client_secret: config.clientSecret, ...params }),
      },
      config.retry,
    );
  }

  /** TikTok sometimes answers token errors with 200 and an `error` field. */
  async function readToken(response: Response, failure: (reason: string) => Error): Promise<TikTokToken> {
    if (!response.ok) throw failure(`${response.status} ${await errorCode(response)}`);
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (body && typeof body.error === "string" && body.error) throw failure(`200 ${body.error}`);
    return parseJson(new Response(JSON.stringify(body)), tiktokTokenSchema, "tiktok.oauth.token").catch(() => {
      throw failure("unexpected shape");
    });
  }

  return {
    platform: "tiktok",

    buildAuthUrl({ state, redirectUri }) {
      const url = new URL(TIKTOK_AUTH_URL);
      url.searchParams.set("client_key", config.clientKey);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", [...TIKTOK_SCOPES, ...(config.publish ? TIKTOK_PUBLISH_SCOPES : [])].join(","));
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);
      return url.toString();
    },

    async handleCallback({ code, redirectUri }) {
      const response = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri });
      const token = await readToken(response, (reason) => new ConnectorError("token_exchange_failed", `TikTok token exchange failed (${reason})`));

      const granted = grantedScopes(token);
      if (token.scope !== undefined && REQUIRED_SCOPES.some((scope) => !granted.includes(scope))) throw new ConnectorError("missing_scopes");

      let user;
      try {
        user = await createTikTokClient({ accessToken: token.access_token, fetch: fetchFn, retry: config.retry }).userInfo(
          userFieldsFor(token.scope === undefined ? null : granted),
        );
      } catch (error) {
        const reason = error instanceof HttpError ? `${error.status} ${error.code}` : error instanceof Error ? error.name : "unknown";
        throw new ConnectorError("accounts_lookup_failed", `TikTok user info failed (${reason})`);
      }

      const account: ConnectedAccount = {
        platform: "tiktok",
        externalId: user.open_id ?? token.open_id,
        name: user.display_name ?? null,
        handle: user.username ?? null,
        avatarUrl: user.avatar_url ?? null,
        tokens: toTokens(token, now()),
      };
      return [account];
    },

    async refresh(refreshToken) {
      const response = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
      const token = await readToken(response, (reason) =>
        /invalid_grant|refresh_token/.test(reason) ? new RefreshRejectedError("TikTok rejected the refresh token") : new HttpError(response.status, reason),
      );
      // TikTok may rotate the refresh token; the store keeps the old one when it does not.
      return toTokens(token, now());
    },
  };
}
