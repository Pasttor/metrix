import { dateInTimeZone } from "@/lib/dates";

/**
 * In-app alerts (T16): an account that needs reconnecting, a sync run that
 * ended in error, or a Meta user token that expires in under 10 days. Each
 * becomes a notification at most once per account (or platform) per day.
 */

export const TOKEN_WARNING_DAYS = 10;

export type AlertAccount = { id: string; platform: string; name: string | null; status: string; refreshExpiresAt: string | null };
export type AlertRun = { platform: string; status: string; error: string | null; startedAt: string };

export type Severity = "info" | "warning" | "error";

export type Alert = {
  /** Dedupe key; one notification per key per day. */
  key: string;
  kind: "reauth_required" | "token_expiring" | "sync_error";
  severity: Severity;
  title: string;
  message: string;
  href: string;
};

export type NotificationRow = {
  kind: string;
  severity: Severity;
  title: string;
  message: string;
  href: string | null;
  dedupe_key: string;
};

const LABELS: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", drive: "Google Drive", meta: "Facebook e Instagram" };
const CONNECTIONS = "/settings/connections";
const HEALTH = "/settings/health";

export function collectAlerts(input: { accounts: AlertAccount[]; runs: AlertRun[]; now: Date }): Alert[] {
  const alerts: Alert[] = [];
  const nowMs = input.now.getTime();

  for (const account of input.accounts) {
    const label = `${LABELS[account.platform] ?? account.platform}${account.name ? ` (${account.name})` : ""}`;
    if (account.status === "reauth_required") {
      alerts.push({
        key: `account:${account.id}`,
        kind: "reauth_required",
        severity: "error",
        title: `${label}: hay que reconectar la cuenta`,
        message: "La red rechazó el acceso de Metrix. Da clic en Reconectar en Configuración → Conexiones para seguir guardando datos.",
        href: CONNECTIONS,
      });
      continue;
    }
    // Meta keeps the 60-day user token in refresh_expires_at; YouTube has none once in production.
    if ((account.platform === "facebook" || account.platform === "instagram") && account.refreshExpiresAt) {
      const days = Math.ceil((Date.parse(account.refreshExpiresAt) - nowMs) / 86_400_000);
      if (days <= TOKEN_WARNING_DAYS) {
        alerts.push({
          key: `account:${account.id}`,
          kind: "token_expiring",
          severity: days <= 0 ? "error" : "warning",
          title: days <= 0 ? `${label}: el acceso de Meta caducó` : `${label}: el acceso de Meta caduca en ${days} día(s)`,
          message: "Reconecta Meta en Configuración → Conexiones para renovar el acceso por otros 60 días.",
          href: CONNECTIONS,
        });
      }
    }
  }

  // The latest run of each platform, if it failed in the last day.
  const latest = new Map<string, AlertRun>();
  for (const run of input.runs) {
    const current = latest.get(run.platform);
    if (!current || run.startedAt > current.startedAt) latest.set(run.platform, run);
  }
  for (const run of latest.values()) {
    if (run.status === "error" && nowMs - Date.parse(run.startedAt) <= 86_400_000) {
      alerts.push({
        key: `run:${run.platform}`,
        kind: "sync_error",
        severity: "error",
        title: `${LABELS[run.platform] ?? run.platform}: la sincronización falló`,
        message: run.error ? `Detalle: ${run.error}. Revisa Configuración → Salud.` : "Revisa el detalle en Configuración → Salud.",
        href: HEALTH,
      });
    }
  }

  return [...new Map(alerts.map((alert) => [alert.key, alert])).values()];
}

/** Notification rows for today: the dedupe key includes the date, so the same alert repeats at most once a day. */
export function toNotificationRows(alerts: Alert[], now: Date, timeZone: string): NotificationRow[] {
  const today = dateInTimeZone(now, timeZone);
  return alerts.map((alert) => ({
    kind: alert.kind,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    href: alert.href,
    dedupe_key: `${alert.key}:${today}`,
  }));
}
