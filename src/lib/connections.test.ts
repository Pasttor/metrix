import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createClient: vi.fn() }));

import { summarize, type ConnectionAccount } from "./connections";

const account = (overrides: Partial<ConnectionAccount>): ConnectionAccount => ({
  id: "1",
  platform: "youtube",
  name: "Canal",
  handle: null,
  avatarUrl: null,
  status: "active",
  lastSyncedAt: null,
  ...overrides,
});

describe("summarize", () => {
  it("is 'disconnected' without accounts or with only disabled ones", () => {
    expect(summarize([]).status).toBe("disconnected");
    expect(summarize([account({ status: "disabled" })]).status).toBe("disconnected");
  });

  it("asks to reconnect when any account needs reauth", () => {
    expect(summarize([account({}), account({ id: "2", status: "reauth_required" })]).status).toBe("reauth_required");
  });

  it("reports the latest sync time", () => {
    const result = summarize([
      account({ lastSyncedAt: "2026-11-07T10:00:00Z" }),
      account({ id: "2", lastSyncedAt: "2026-11-08T09:00:00Z" }),
    ]);
    expect(result).toEqual({ status: "connected", lastSyncedAt: "2026-11-08T09:00:00Z" });
  });
});
