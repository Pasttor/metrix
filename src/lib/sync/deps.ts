import "server-only";
import { recordAlerts } from "@/lib/notifications";
import { isAuthorizedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { getEnv } from "@/lib/env";
import type { AccountPlatform } from "@/lib/oauth/types";
import type { BackfillDeps, CronDeps } from "./handlers";
import { getSyncer } from "./registry";
import { supabaseSyncRepo } from "./supabase-repo";

export function cronDeps(): CronDeps {
  return { repo: supabaseSyncRepo(createAdminClient()), getSyncer, cronSecret: getEnv().CRON_SECRET, afterRun: recordAlerts };
}

export function backfillDeps(): BackfillDeps {
  const db = createAdminClient();
  return {
    repo: supabaseSyncRepo(db),
    getSyncer,
    isAuthorized: isAuthorizedUser,
    async getAccountPlatform(accountId) {
      const { data } = await db.from("accounts").select("platform").eq("id", accountId).maybeSingle();
      return (data?.platform as AccountPlatform | undefined) ?? null;
    },
  };
}
