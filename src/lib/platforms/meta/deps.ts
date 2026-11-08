import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getEnv } from "@/lib/env";
import { createTokenStoreForServer } from "@/lib/oauth/deps";
import { supabaseMetricsStore } from "@/lib/sync/supabase-metrics-store";
import type { Syncer } from "@/lib/sync/types";
import { createInstagramSyncer } from "./instagram-sync";
import { createMetaSyncer } from "./sync";

export function metaSyncer(): Syncer {
  const env = getEnv();
  const tokens = createTokenStoreForServer();
  // Page tokens never expire, so there is nothing to refresh: a rejected token
  // marks the account for reconnection.
  const instagram = createInstagramSyncer({
    getAccessToken: (accountId) => tokens.getValidAccessToken(accountId),
    markReauthRequired: (accountId) => tokens.markReauthRequired(accountId),
    store: supabaseMetricsStore(createAdminClient()),
    version: env.META_GRAPH_VERSION,
    reportTimeZone: env.REPORT_TIMEZONE,
  });
  return createMetaSyncer({ instagram });
}
