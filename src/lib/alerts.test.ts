import { describe, expect, it } from "vitest";
import { collectAlerts, toNotificationRows, type AlertAccount } from "./alerts";

const NOW = new Date("2026-11-09T12:00:00Z");
const account = (overrides: Partial<AlertAccount>): AlertAccount => ({
  id: "a1",
  platform: "youtube",
  name: "Canal",
  status: "active",
  refreshExpiresAt: null,
  ...overrides,
});

describe("collectAlerts", () => {
  it("flags accounts that need reconnecting as errors", () => {
    const [alert] = collectAlerts({ accounts: [account({ status: "reauth_required" })], runs: [], now: NOW });
    expect(alert).toMatchObject({ key: "account:a1", kind: "reauth_required", severity: "error", href: "/settings/connections" });
    expect(alert.title).toBe("YouTube (Canal): hay que reconectar la cuenta");
  });

  it("warns 10 days before a Meta token expires, not earlier", () => {
    const soon = account({ id: "ig", platform: "instagram", refreshExpiresAt: "2026-11-15T12:00:00Z" });
    const later = account({ id: "fb", platform: "facebook", refreshExpiresAt: "2027-01-07T12:00:00Z" });
    const alerts = collectAlerts({ accounts: [soon, later], runs: [], now: NOW });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ key: "account:ig", kind: "token_expiring", severity: "warning" });
    expect(alerts[0].title).toContain("caduca en 6 día(s)");
  });

  it("flags the latest run of a platform when it failed in the last day", () => {
    const runs = [
      { platform: "meta", status: "error", error: "La cuenta necesita reconectarse", startedAt: "2026-11-09T10:00:00Z" },
      { platform: "meta", status: "success", error: null, startedAt: "2026-11-08T10:00:00Z" },
      { platform: "youtube", status: "error", error: "x", startedAt: "2026-11-08T09:00:00Z" },
      { platform: "youtube", status: "success", error: null, startedAt: "2026-11-09T09:00:00Z" },
      { platform: "tiktok", status: "error", error: "old", startedAt: "2026-11-01T09:00:00Z" },
    ];
    const alerts = collectAlerts({ accounts: [], runs, now: NOW });
    expect(alerts.map((alert) => alert.key)).toEqual(["run:meta"]);
    expect(alerts[0]).toMatchObject({ kind: "sync_error", href: "/settings/health" });
    expect(alerts[0].message).toContain("La cuenta necesita reconectarse");
  });
});

describe("toNotificationRows", () => {
  it("keys each alert by day so it repeats at most once a day", () => {
    const alerts = collectAlerts({ accounts: [account({ status: "reauth_required" })], runs: [], now: NOW });
    const [today] = toNotificationRows(alerts, NOW, "America/Mexico_City");
    const [tomorrow] = toNotificationRows(alerts, new Date("2026-11-10T12:00:00Z"), "America/Mexico_City");
    expect(today.dedupe_key).toBe("account:a1:2026-11-09");
    expect(tomorrow.dedupe_key).toBe("account:a1:2026-11-10");
    expect(today).toMatchObject({ kind: "reauth_required", severity: "error", href: "/settings/connections" });
  });
});
