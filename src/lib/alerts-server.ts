import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getEnv } from "@/lib/env";
import { collectAlerts, dispatchAlerts, type Alert } from "./alerts";

const RESEND_URL = "https://api.resend.com/emails";
const SENT_PREFIX = "alert_sent:";

function fail(operation: string, error: { code?: string }): never {
  throw new Error(`Database error in ${operation}${error.code ? ` (${error.code})` : ""}`);
}

/**
 * Checks accounts and recent runs and emails what is new today. Without
 * RESEND_API_KEY or ALERT_EMAIL_TO it only reports what it would have sent.
 */
export async function checkAndSendAlerts(): Promise<{ sent: Alert[]; skipped: boolean }> {
  const env = getEnv();
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
  if (alerts.length === 0) return { sent: [], skipped: false };

  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL_TO) {
    console.warn(`[alerts] ${alerts.length} alert(s) not emailed: RESEND_API_KEY or ALERT_EMAIL_TO missing`);
    return { sent: [], skipped: true };
  }

  const sent = await dispatchAlerts(alerts, {
    timeZone: env.REPORT_TIMEZONE,
    async sentOn(key) {
      const { data, error } = await db.from("app_config").select("value").eq("key", `${SENT_PREFIX}${key}`).maybeSingle();
      if (error) fail("app_config.alertSent", error);
      return data?.value ?? null;
    },
    async markSent(key, date) {
      const { error } = await db
        .from("app_config")
        .upsert({ key: `${SENT_PREFIX}${key}`, value: date, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) fail("app_config.markAlert", error);
    },
    async send(subject, text) {
      const response = await fetch(RESEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.ALERT_EMAIL_FROM, to: [env.ALERT_EMAIL_TO], subject: subject.slice(0, 180), text }),
      });
      if (!response.ok) throw new Error(`Resend responded ${response.status}`);
    },
  });
  return { sent, skipped: false };
}
