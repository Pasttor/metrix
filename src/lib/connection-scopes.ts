import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { missingScopes } from "@/lib/platforms/tiktok/connector";

/**
 * Scopes the user did not grant, per TikTok account (oauth_tokens is
 * server-only; only scope names leave this function, never tokens).
 */
export async function tiktokMissingScopes(): Promise<Map<string, string[]>> {
  const { data, error } = await createAdminClient().from("oauth_tokens").select("account_id, scopes, accounts!inner(platform)").eq("accounts.platform", "tiktok");
  if (error) return new Map();
  return new Map(data.map((row) => [row.account_id, missingScopes(row.scopes ?? [])]));
}
