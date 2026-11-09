import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getEnv } from "@/lib/env";
import type { PlatformConnector } from "@/lib/oauth/connector";
import { createTokenStoreForServer } from "@/lib/oauth/deps";
import { supabaseMetricsStore } from "@/lib/sync/supabase-metrics-store";
import type { Syncer } from "@/lib/sync/types";
import { createTikTokSyncer } from "./sync";

export function tiktokSyncer(connector: PlatformConnector): Syncer {
  const tokens = createTokenStoreForServer();
  return createTikTokSyncer({
    getAccessToken: (accountId, options) => tokens.getValidAccessToken(accountId, (refreshToken) => connector.refresh(refreshToken), options),
    store: supabaseMetricsStore(createAdminClient()),
    reportTimeZone: getEnv().REPORT_TIMEZONE,
  });
}
