import type { FetchFn } from "@/lib/platforms/http";
import type { AccountPlatform } from "./types";

/**
 * Revokes Metrix's access at the provider when the user disconnects an
 * account. Best effort: the stored data is deleted either way, and Meta Page
 * tokens are removed from Facebook's Business Integrations instead.
 *
 * Google revokes the whole grant of this OAuth client for that Google
 * account, so YouTube and Drive on the same Google account lose access together.
 */

export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const TIKTOK_REVOKE_URL = "https://open.tiktokapis.com/v2/oauth/revoke/";

export type RevokeTokens = { accessToken: string; refreshToken: string | null };
export type RevokeCredentials = { tiktokClientKey?: string; tiktokClientSecret?: string };

export async function revokeAtProvider(platform: AccountPlatform, tokens: RevokeTokens, credentials: RevokeCredentials, fetchFn: FetchFn = fetch): Promise<boolean> {
  const form = (body: Record<string, string>) => ({
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });

  if (platform === "youtube" || platform === "drive") {
    // Revoking the refresh token also invalidates its access tokens.
    const response = await fetchFn(GOOGLE_REVOKE_URL, form({ token: tokens.refreshToken ?? tokens.accessToken }));
    return response.ok;
  }
  if (platform === "tiktok") {
    if (!credentials.tiktokClientKey || !credentials.tiktokClientSecret) return false;
    const response = await fetchFn(
      TIKTOK_REVOKE_URL,
      form({ client_key: credentials.tiktokClientKey, client_secret: credentials.tiktokClientSecret, token: tokens.accessToken }),
    );
    return response.ok;
  }
  return false;
}
