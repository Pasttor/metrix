import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getEnv } from "@/lib/env";
import { createTokenStoreForServer } from "@/lib/oauth/deps";
import { supabaseMetricsStore } from "@/lib/sync/supabase-metrics-store";
import type { Syncer } from "@/lib/sync/types";
import { createFacebookSyncer } from "./facebook-sync";
import { createInstagramSyncer } from "./instagram-sync";
import { createMetaSyncer } from "./sync";

export function metaSyncer(): Syncer {
  const env = getEnv();
  const tokens = createTokenStoreForServer();
  // Page tokens never expire, so there is nothing to refresh: a rejected token
  // marks the account for reconnection.
  const shared = {
    getAccessToken: (accountId: string) => tokens.getValidAccessToken(accountId),
    markReauthRequired: (accountId: string) => tokens.markReauthRequired(accountId),
    store: supabaseMetricsStore(createAdminClient()),
    version: env.META_GRAPH_VERSION,
    reportTimeZone: env.REPORT_TIMEZONE,
  };
  return createMetaSyncer({ instagram: createInstagramSyncer(shared), facebook: createFacebookSyncer(shared) });
}
