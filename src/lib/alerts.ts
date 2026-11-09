import { dateInTimeZone } from "@/lib/dates";

/**
 * Email alerts (T16): an account that needs reconnecting, a sync run that
 * ended in error, or a Meta user token that expires in under 10 days.
 * At most one email per account (or platform, for runs) per day.
 */

export const TOKEN_WARNING_DAYS = 10;

export type AlertAccount = { id: string; platform: string; name: string | null; status: string; refreshExpiresAt: string | null };
export type AlertRun = { platform: string; status: string; error: string | null; startedAt: string };

export type Alert = {
  /** Dedupe key: one email per key per day. */
  key: string;
  line: string;
};

const LABELS: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", meta: "Meta" };

export function collectAlerts(input: { accounts: AlertAccount[]; runs: AlertRun[]; now: Date }): Alert[] {
  const alerts: Alert[] = [];
  const nowMs = input.now.getTime();

  for (const account of input.accounts) {
    const label = `${LABELS[account.platform] ?? account.platform}${account.name ? ` (${account.name})` : ""}`;
    if (account.status === "reauth_required") {
      alerts.push({ key: `account:${account.id}`, line: `${label}: la cuenta necesita reconectarse en Configuración → Conexiones.` });
      continue;
    }
    // Meta keeps the 60-day user token in refresh_expires_at; YouTube has none once in production.
    if ((account.platform === "facebook" || account.platform === "instagram") && account.refreshExpiresAt) {
      const days = Math.ceil((Date.parse(account.refreshExpiresAt) - nowMs) / 86_400_000);
      if (days <= TOKEN_WARNING_DAYS) {
        alerts.push({
          key: `account:${account.id}`,
          line:
            days <= 0
              ? `${label}: el acceso de Meta ya caducó; reconecta Meta en Configuración.`
              : `${label}: el acceso de Meta caduca en ${days} día(s); reconecta Meta en Configuración antes de esa fecha.`,
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
        line: `${LABELS[run.platform] ?? run.platform}: la última sincronización falló${run.error ? ` (${run.error})` : ""}.`,
      });
    }
  }

  // An account alert already covers its platform's failed run on the same day.
  return [...new Map(alerts.map((alert) => [alert.key, alert])).values()];
}

export type AlertDeps = {
  sentOn: (key: string) => Promise<string | null>;
  markSent: (key: string, date: string) => Promise<void>;
  send: (subject: string, text: string) => Promise<void>;
  timeZone: string;
  now?: () => Date;
};

/** Sends one email with every alert not already sent today; returns the alerts it sent. */
export async function dispatchAlerts(alerts: Alert[], deps: AlertDeps): Promise<Alert[]> {
  const today = dateInTimeZone(deps.now?.() ?? new Date(), deps.timeZone);
  const fresh: Alert[] = [];
  for (const alert of alerts) {
    if ((await deps.sentOn(alert.key)) !== today) fresh.push(alert);
  }
  if (fresh.length === 0) return [];
  const text = ["Metrix detectó lo siguiente:", "", ...fresh.map((alert) => `• ${alert.line}`), "", "Revisa Configuración → Salud para el detalle."].join("\n");
  await deps.send(fresh.length === 1 ? `Metrix: ${fresh[0].line}` : `Metrix: ${fresh.length} avisos de sincronización`, text);
  for (const alert of fresh) await deps.markSent(alert.key, today);
  return fresh;
}
