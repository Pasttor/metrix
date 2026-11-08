import "server-only";
import { isAuthorizedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { getEnv } from "@/lib/env";
import { getConnector } from "@/lib/platforms/registry";
import type { ConnectDeps } from "./flow";
import { supabaseSaveConnection, supabaseStateStore, supabaseTokenRepo } from "./supabase-stores";
import { createTokenStore } from "./token-store";

export function createTokenStoreForServer() {
  return createTokenStore(supabaseTokenRepo(createAdminClient()));
}

export function connectDeps(): ConnectDeps {
  const db = createAdminClient();
  return {
    appUrl: getEnv().APP_URL,
    isAuthorized: isAuthorizedUser,
    getConnector,
    stateStore: supabaseStateStore(db),
    saveConnection: supabaseSaveConnection(db, createTokenStoreForServer()),
  };
}
