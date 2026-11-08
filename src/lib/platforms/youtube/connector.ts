import { ConnectorError, type ConnectedAccount, type PlatformConnector } from "@/lib/oauth/connector";
import { RefreshRejectedError } from "@/lib/oauth/token-store";
import type { OAuthTokens } from "@/lib/oauth/types";
import { errorCode, HttpError, parseJson, fetchWithRetry, type FetchFn, type RetryOptions } from "@/lib/platforms/http";
import { createYouTubeClient } from "./client";
import { googleTokenSchema, type Channel, type GoogleToken } from "./schemas";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const YOUTUBE_SCOPES = {
  readonly: "https://www.googleapis.com/auth/youtube.readonly",
  analytics: "https://www.googleapis.com/auth/yt-analytics.readonly",
  monetary: "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
} as const;

/** Scopes without which nothing can be synced; the user can untick them on the consent screen. */
const REQUIRED_SCOPES = [YOUTUBE_SCOPES.readonly, YOUTUBE_SCOPES.analytics];

export type YouTubeConnectorConfig = {
  clientId: string;
  clientSecret: string;
  monetary: boolean;
  fetch?: FetchFn;
  retry?: RetryOptions;
  now?: () => Date;
};

export function youtubeScopes(monetary: boolean): string[] {
  return monetary
    ? [YOUTUBE_SCOPES.readonly, YOUTUBE_SCOPES.analytics, YOUTUBE_SCOPES.monetary]
    : [YOUTUBE_SCOPES.readonly, YOUTUBE_SCOPES.analytics];
}

function toTokens(token: GoogleToken, now: Date): OAuthTokens {
  const at = (seconds: number | undefined) => (seconds === undefined ? null : new Date(now.getTime() + seconds * 1000));
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: at(token.expires_in),
    refreshExpiresAt: at(token.refresh_token_expires_in),
    scopes: token.scope ? token.scope.split(" ").filter(Boolean) : undefined,
  };
}

function bestThumbnail(channel: Channel): string | null {
  const thumbnails = channel.snippet.thumbnails;
  return thumbnails?.medium?.url ?? thumbnails?.default?.url ?? thumbnails?.high?.url ?? null;
}

export function createYouTubeConnector(config: YouTubeConnectorConfig): PlatformConnector {
  const fetchFn = config.fetch ?? fetch;
  const now = config.now ?? (() => new Date());

  async function tokenRequest(params: Record<string, string>): Promise<Response> {
    return fetchWithRetry(
      fetchFn,
      GOOGLE_TOKEN_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...params }),
      },
      config.retry,
    );
  }

  return {
    platform: "youtube",

    buildAuthUrl({ state, codeChallenge, redirectUri }) {
      const url = new URL(GOOGLE_AUTH_URL);
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", youtubeScopes(config.monetary).join(" "));
      // offline + consent makes Google issue a refresh token on every connection.
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
      return url.toString();
    },

    async handleCallback({ code, codeVerifier, redirectUri }) {
      const response = await tokenRequest({
        grant_type: "authorization_code",
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
      });
      if (!response.ok) {
        const reason = await errorCode(response);
        throw new ConnectorError("token_exchange_failed", `Google token exchange failed (${response.status} ${reason})`);
      }
      const token = await parseJson(response, googleTokenSchema, "google.token").catch(() => {
        throw new ConnectorError("token_exchange_failed", "Google token response had an unexpected shape");
      });

      if (!token.refresh_token) throw new ConnectorError("no_refresh_token");

      const granted = new Set(token.scope?.split(" ") ?? []);
      if (token.scope !== undefined && REQUIRED_SCOPES.some((scope) => !granted.has(scope))) {
        throw new ConnectorError("missing_scopes");
      }

      const tokens = toTokens(token, now());
      let channels: Channel[];
      try {
        channels = await createYouTubeClient({ accessToken: token.access_token, fetch: fetchFn, retry: config.retry }).listMyChannels();
      } catch (error) {
        const reason = error instanceof HttpError ? `${error.status} ${error.code}` : error instanceof Error ? error.name : "unknown";
        throw new ConnectorError("channel_lookup_failed", `channels.list failed (${reason})`);
      }
      if (channels.length === 0) throw new ConnectorError("no_channel");

      // The consented identity (Google account or brand account) decides which channel Google returns.
      return channels.map<ConnectedAccount>((channel) => ({
        platform: "youtube",
        externalId: channel.id,
        name: channel.snippet.title,
        // customUrl is "@handle"; accounts.handle is stored without the "@" (the UI adds it).
        handle: channel.snippet.customUrl?.replace(/^@/, "") || null,
        avatarUrl: bestThumbnail(channel),
        tokens,
      }));
    },

    async refresh(refreshToken) {
      const response = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
      if (!response.ok) {
        const reason = await errorCode(response);
        // invalid_grant: revoked, expired or password changed. The user must reconnect.
        if (reason === "invalid_grant") throw new RefreshRejectedError("Google rejected the refresh token");
        throw new HttpError(response.status, reason);
      }
      const token = await parseJson(response, googleTokenSchema, "google.token");
      return toTokens(token, now());
    },
  };
}
