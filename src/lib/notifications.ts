import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getEnv } from "@/lib/env";
import { collectAlerts, toNotificationRows, type NotificationRow } from "./alerts";

function fail(operation: string, error: { code?: string }): never {
  throw new Error(`Database error in ${operation}${error.code ? ` (${error.code})` : ""}`);
}

/** Inserts notifications, skipping the ones whose dedupe key already exists. */
export async function insertNotifications(rows: NotificationRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await createAdminClient().from("notifications").upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });
  if (error) fail("notifications.insert", error);
}

/** Runs after each cron sync: turns account and run problems into in-app alerts. */
export async function recordAlerts(): Promise<void> {
  const db = createAdminClient();
  const now = new Date();
  const [accounts, runs] = await Promise.all([
    db.from("accounts").select("id, platform, name, status, oauth_tokens(refresh_expires_at)"),
    db.from("sync_runs").select("platform, status, error, started_at").gte("started_at", new Date(now.getTime() - 2 * 86_400_000).toISOString()),
  ]);
  if (accounts.error) fail("accounts.alerts", accounts.error);
  if (runs.error) fail("sync_runs.alerts", runs.error);

  const alerts = collectAlerts({
    now,
    accounts: accounts.data.map((row) => {
      const token = Array.isArray(row.oauth_tokens) ? row.oauth_tokens[0] : row.oauth_tokens;
      return { id: row.id, platform: row.platform, name: row.name, status: row.status, refreshExpiresAt: token?.refresh_expires_at ?? null };
    }),
    runs: runs.data.map((row) => ({ platform: row.platform, status: row.status, error: row.error, startedAt: row.started_at })),
  });
  await insertNotifications(toNotificationRows(alerts, now, getEnv().REPORT_TIMEZONE));
}
