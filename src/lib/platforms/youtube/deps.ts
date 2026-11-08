import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getEnv } from "@/lib/env";
import { createTokenStoreForServer } from "@/lib/oauth/deps";
import type { PlatformConnector } from "@/lib/oauth/connector";
import { supabaseMetricsStore } from "@/lib/sync/supabase-metrics-store";
import type { Syncer } from "@/lib/sync/types";
import type { RetentionDeps } from "./retention";
import { createYouTubeSyncer } from "./sync";

function accessTokenGetter(connector: PlatformConnector) {
  const tokens = createTokenStoreForServer();
  return (accountId: string) => tokens.getValidAccessToken(accountId, (refreshToken) => connector.refresh(refreshToken));
}

export function youtubeSyncer(connector: PlatformConnector): Syncer {
  const env = getEnv();
  return createYouTubeSyncer({
    getAccessToken: accessTokenGetter(connector),
    store: supabaseMetricsStore(createAdminClient()),
    monetary: env.YOUTUBE_MONETARY,
    reportTimeZone: env.REPORT_TIMEZONE,
  });
}

export function youtubeRetentionDeps(connector: PlatformConnector): RetentionDeps {
  const db = createAdminClient();
  return {
    getAccessToken: accessTokenGetter(connector),
    async getPost(postId) {
      const { data, error } = await db
        .from("posts")
        .select("account_id, external_id, published_at, raw, accounts!inner(platform)")
        .eq("id", postId)
        .eq("accounts.platform", "youtube")
        .maybeSingle();
      if (error) throw new Error(`Database error in posts.get${error.code ? ` (${error.code})` : ""}`);
      return data ? { accountId: data.account_id, externalId: data.external_id, publishedAt: data.published_at, raw: data.raw } : null;
    },
    async savePostRaw(postId, raw) {
      const { error } = await db.from("posts").update({ raw }).eq("id", postId);
      if (error) throw new Error(`Database error in posts.saveRaw${error.code ? ` (${error.code})` : ""}`);
    },
  };
}
