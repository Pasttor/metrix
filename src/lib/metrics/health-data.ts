import "server-only";
import { createClient } from "@/lib/db/server";
import { fail } from "./data";

/** Sync health: recent runs per platform and the state of each account, read with the user's session. */

export const HEALTH_RUNS = 30;
export const HEALTH_PLATFORMS = [
  { key: "youtube", label: "YouTube" },
  { key: "meta", label: "Facebook e Instagram" },
  { key: "tiktok", label: "TikTok" },
] as const;

export type HealthRun = {
  id: string;
  job: string;
  status: string;
  startedAt: string;
  durationSeconds: number | null;
  rowsWritten: number | null;
  quota: number | null;
  warnings: string[];
  errors: string[];
  error: string | null;
};

export type HealthAccount = {
  platform: string;
  name: string | null;
  status: string;
  lastSyncedAt: string | null;
};

function asStringList(value: unknown, pick?: (item: Record<string, unknown>) => unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const text = pick && item && typeof item === "object" ? pick(item as Record<string, unknown>) : item;
    return typeof text === "string" ? [text] : [];
  });
}

export async function getHealth(): Promise<{ runs: Record<string, HealthRun[]>; accounts: HealthAccount[] }> {
  const db = await createClient();
  const runs: Record<string, HealthRun[]> = {};
  for (const platform of HEALTH_PLATFORMS) {
    const { data, error } = await db
      .from("sync_runs")
      .select("id, job, status, started_at, finished_at, stats, error")
      .eq("platform", platform.key)
      .order("started_at", { ascending: false })
      .limit(HEALTH_RUNS);
    if (error) fail("sync_runs.health", error);
    runs[platform.key] = data.map((row) => {
      const stats = (row.stats && typeof row.stats === "object" && !Array.isArray(row.stats) ? row.stats : {}) as Record<string, unknown>;
      return {
        id: row.id,
        job: row.job,
        status: row.status,
        startedAt: row.started_at,
        durationSeconds: row.finished_at ? Math.max(0, (Date.parse(row.finished_at) - Date.parse(row.started_at)) / 1000) : null,
        rowsWritten: typeof stats.rowsWritten === "number" ? stats.rowsWritten : null,
        quota: typeof stats.quotaUnits === "number" ? stats.quotaUnits : null,
        warnings: asStringList(stats.warnings),
        errors: asStringList(stats.errors, (item) => item.message),
        error: row.error,
      };
    });
  }

  const { data: accounts, error } = await db.from("accounts").select("platform, name, handle, status, last_synced_at").order("platform");
  if (error) fail("accounts.health", error);
  return {
    runs,
    accounts: accounts.map((row) => ({
      platform: row.platform,
      name: row.handle ? `@${row.handle}` : row.name,
      status: row.status,
      lastSyncedAt: row.last_synced_at,
    })),
  };
}
