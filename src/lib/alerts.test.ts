import { describe, expect, it, vi } from "vitest";
import { collectAlerts, dispatchAlerts, type AlertAccount } from "./alerts";

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
  it("flags accounts that need reconnecting", () => {
    const alerts = collectAlerts({ accounts: [account({ status: "reauth_required" })], runs: [], now: NOW });
    expect(alerts).toEqual([{ key: "account:a1", line: expect.stringContaining("YouTube (Canal): la cuenta necesita reconectarse") }]);
  });

  it("warns 10 days before a Meta token expires, not earlier", () => {
    const soon = account({ id: "ig", platform: "instagram", refreshExpiresAt: "2026-11-15T12:00:00Z" });
    const later = account({ id: "fb", platform: "facebook", refreshExpiresAt: "2027-01-07T12:00:00Z" });
    const alerts = collectAlerts({ accounts: [soon, later], runs: [], now: NOW });
    expect(alerts).toEqual([{ key: "account:ig", line: expect.stringContaining("caduca en 6 día(s)") }]);
  });

  it("flags the latest run of a platform when it failed in the last day", () => {
    const runs = [
      { platform: "meta", status: "error", error: "La cuenta necesita reconectarse", startedAt: "2026-11-09T10:00:00Z" },
      { platform: "meta", status: "success", error: null, startedAt: "2026-11-08T10:00:00Z" },
      { platform: "youtube", status: "error", error: "x", startedAt: "2026-11-08T09:00:00Z" },
      { platform: "youtube", status: "success", error: null, startedAt: "2026-11-09T09:00:00Z" },
      { platform: "tiktok", status: "error", error: "old", startedAt: "2026-11-01T09:00:00Z" },
    ];
    expect(collectAlerts({ accounts: [], runs, now: NOW }).map((alert) => alert.key)).toEqual(["run:meta"]);
  });
});

describe("dispatchAlerts", () => {
  function deps(sent: Record<string, string> = {}) {
    const store = { ...sent };
    return {
      store,
      send: vi.fn(async (subject: string, text: string) => {
        void subject;
        void text;
      }),
      sentOn: async (key: string) => store[key] ?? null,
      markSent: async (key: string, date: string) => {
        store[key] = date;
      },
      timeZone: "America/Mexico_City",
      now: () => NOW,
    };
  }

  it("sends one email with every new alert and remembers them for the day", async () => {
    const d = deps();
    const alerts = [
      { key: "account:a1", line: "YouTube: reconecta" },
      { key: "run:meta", line: "Meta: falló" },
    ];
    expect(await dispatchAlerts(alerts, d)).toHaveLength(2);
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(d.send.mock.calls[0][0]).toBe("Metrix: 2 avisos de sincronización");
    expect(d.store).toEqual({ "account:a1": "2026-11-09", "run:meta": "2026-11-09" });

    // Same day: nothing new to send.
    expect(await dispatchAlerts(alerts, d)).toEqual([]);
    expect(d.send).toHaveBeenCalledTimes(1);
  });

  it("sends again the next day", async () => {
    const d = deps({ "account:a1": "2026-11-08" });
    expect(await dispatchAlerts([{ key: "account:a1", line: "YouTube: reconecta" }], d)).toHaveLength(1);
    expect(d.send.mock.calls[0][0]).toBe("Metrix: YouTube: reconecta");
  });
});
