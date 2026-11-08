import "server-only";
import type { AdminClient } from "@/lib/db/admin";
import type { Json } from "@/lib/db/types";
import type { AccountPlatform } from "@/lib/oauth/types";
import type { RunCursor, SyncRepo } from "./types";

function fail(operation: string, error: { code?: string } | null): never {
  throw new Error(`Database error in ${operation}${error?.code ? ` (${error.code})` : ""}`);
}

export function supabaseSyncRepo(db: AdminClient): SyncRepo {
  return {
    async listAccounts(platforms, accountId) {
      let query = db
        .from("accounts")
        .select("id, platform, external_id, name")
        .in("platform", platforms)
        .eq("status", "active")
        .order("connected_at");
      if (accountId) query = query.eq("id", accountId);
      const { data, error } = await query;
      if (error) fail("accounts.list", error);
      return data.map((row) => ({
        id: row.id,
        platform: row.platform as AccountPlatform,
        externalId: row.external_id,
        name: row.name,
      }));
    },

    async findResumableCursor({ platform, job, accountId }) {
      let query = db
        .from("sync_runs")
        .select("status, cursor")
        .eq("platform", platform)
        .eq("job", job)
        .order("started_at", { ascending: false })
        .limit(1);
      query = accountId ? query.eq("account_id", accountId) : query.is("account_id", null);
      const { data, error } = await query.maybeSingle();
      if (error) fail("sync_runs.findResumable", error);
      return data?.status === "partial" && data.cursor ? (data.cursor as unknown as RunCursor) : null;
    },

    async createRun({ platform, job, accountId, startedAt }) {
      const { data, error } = await db
        .from("sync_runs")
        .insert({ platform, job, account_id: accountId, status: "running", started_at: startedAt.toISOString() })
        .select("id")
        .single();
      if (error || !data) fail("sync_runs.create", error);
      return data.id;
    },

    async finishRun(id, { status, stats, cursor, error: runError, finishedAt }) {
      const { error } = await db
        .from("sync_runs")
        .update({
          status,
          stats: stats as unknown as Json,
          cursor: cursor as unknown as Json,
          error: runError,
          finished_at: finishedAt.toISOString(),
        })
        .eq("id", id);
      if (error) fail("sync_runs.finish", error);
    },

    async markSynced(accountId, at) {
      const { error } = await db.from("accounts").update({ last_synced_at: at.toISOString() }).eq("id", accountId);
      if (error) fail("accounts.markSynced", error);
    },
  };
}
