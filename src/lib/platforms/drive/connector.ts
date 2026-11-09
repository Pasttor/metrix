import { z } from "zod";
import { ConnectorError, type ConnectedAccount, type PlatformConnector } from "@/lib/oauth/connector";
import { RefreshRejectedError } from "@/lib/oauth/token-store";
import type { OAuthTokens } from "@/lib/oauth/types";
import { errorCode, fetchWithRetry, HttpError, parseJson, type FetchFn, type RetryOptions } from "@/lib/platforms/http";
import { GOOGLE_AUTH_URL, GOOGLE_TOKEN_URL } from "@/lib/platforms/youtube/connector";
import { googleTokenSchema, type GoogleToken } from "@/lib/platforms/youtube/schemas";

/**
 * Google Drive, connected apart from YouTube: Google rejects drive.file in
 * the same request as the YouTube scopes, and the videos can live in another
 * Google account than the channel. Only `drive.file` (the files the user
 * picks in Metrix) plus the email to know which account it is.
 */

export const DRIVE_SCOPES = {
  file: "https://www.googleapis.com/auth/drive.file",
  openid: "openid",
  email: "email",
} as const;

export const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const userInfoSchema = z.object({ sub: z.string().min(1), email: z.string().optional(), name: z.string().optional(), picture: z.string().optional() });

export type DriveConnectorConfig = { clientId: string; clientSecret: string; fetch?: FetchFn; retry?: RetryOptions; now?: () => Date };

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

export function createDriveConnector(config: DriveConnectorConfig): PlatformConnector {
  const fetchFn = config.fetch ?? fetch;
  const now = config.now ?? (() => new Date());

  const tokenRequest = (params: Record<string, string>) =>
    fetchWithRetry(
      fetchFn,
      GOOGLE_TOKEN_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...params }),
      },
      config.retry,
    );

  return {
    platform: "drive",

    buildAuthUrl({ state, codeChallenge, redirectUri }) {
      const url = new URL(GOOGLE_AUTH_URL);
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", [DRIVE_SCOPES.openid, DRIVE_SCOPES.email, DRIVE_SCOPES.file].join(" "));
      url.searchParams.set("access_type", "offline");
      // consent: a refresh token every time; select_account: choose which Google account holds the videos.
      url.searchParams.set("prompt", "consent select_account");
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
      return url.toString();
    },

    async handleCallback({ code, codeVerifier, redirectUri }) {
      const response = await tokenRequest({ grant_type: "authorization_code", code, code_verifier: codeVerifier, redirect_uri: redirectUri });
      if (!response.ok) {
        const reason = await errorCode(response);
        throw new ConnectorError("token_exchange_failed", `Google token exchange failed (${response.status} ${reason})`);
      }
      const token = await parseJson(response, googleTokenSchema, "google.token").catch(() => {
        throw new ConnectorError("token_exchange_failed", "Google token response had an unexpected shape");
      });
      if (!token.refresh_token) throw new ConnectorError("no_refresh_token");
      if (token.scope !== undefined && !token.scope.split(" ").includes(DRIVE_SCOPES.file)) throw new ConnectorError("missing_scopes");

      const info = await fetchWithRetry(fetchFn, GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${token.access_token}` } }, config.retry);
      if (!info.ok) throw new ConnectorError("account_lookup_failed", `userinfo failed (${info.status} ${await errorCode(info)})`);
      const user = await parseJson(info, userInfoSchema, "google.userinfo").catch(() => {
        throw new ConnectorError("account_lookup_failed", "userinfo had an unexpected shape");
      });

      const account: ConnectedAccount = {
        platform: "drive",
        externalId: user.sub,
        // The email tells which Google account holds the videos; the Picker opens with it.
        name: user.email ?? user.name ?? "Google Drive",
        handle: null,
        avatarUrl: user.picture ?? null,
        tokens: toTokens(token, now()),
      };
      return [account];
    },

    async refresh(refreshToken) {
      const response = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
      if (!response.ok) {
        const reason = await errorCode(response);
        if (reason === "invalid_grant") throw new RefreshRejectedError("Google rejected the refresh token");
        throw new HttpError(response.status, reason);
      }
      return toTokens(await parseJson(response, googleTokenSchema, "google.token"), now());
    },
  };
}
