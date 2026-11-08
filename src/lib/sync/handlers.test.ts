import { describe, expect, it, vi } from "vitest";
import { handleBackfill, handleCron, isValidCronAuth, type BackfillDeps, type CronDeps } from "./handlers";
import type { SyncRepo } from "./types";

const SECRET = "a-long-enough-cron-secret";
const ACCOUNT_ID = "6f1c1d1e-8a3b-4c7d-9e2f-0a1b2c3d4e5f";

function repo(): SyncRepo {
  return {
    listAccounts: vi.fn().mockResolvedValue([{ id: ACCOUNT_ID, platform: "youtube", externalId: "UC1", name: "Canal" }]),
    findResumableCursor: vi.fn().mockResolvedValue(null),
    createRun: vi.fn().mockResolvedValue("run-1"),
    finishRun: vi.fn().mockResolvedValue(undefined),
    markSynced: vi.fn().mockResolvedValue(undefined),
  };
}

const syncer = { syncAccount: vi.fn().mockResolvedValue({ done: true, rowsWritten: 4, warnings: [] }) };

function cronDeps(overrides: Partial<CronDeps> = {}): CronDeps {
  return { repo: repo(), getSyncer: () => syncer, cronSecret: SECRET, ...overrides };
}

const cronRequest = (auth?: string) =>
  new Request("http://localhost:3000/api/cron/sync-youtube", { headers: auth ? { authorization: auth } : {} });

describe("isValidCronAuth", () => {
  it("only accepts the exact bearer secret", () => {
    expect(isValidCronAuth(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isValidCronAuth(null, SECRET)).toBe(false);
    expect(isValidCronAuth(SECRET, SECRET)).toBe(false);
    expect(isValidCronAuth(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isValidCronAuth("Bearer wrong", SECRET)).toBe(false);
  });
});

describe("handleCron", () => {
  it("rejects requests without the secret with 401 and runs nothing", async () => {
    const deps = cronDeps();
    for (const auth of [undefined, "Bearer nope", SECRET]) {
      const response = await handleCron(cronRequest(auth), "youtube", deps);
      expect(response.status).toBe(401);
    }
    expect(deps.repo.createRun).not.toHaveBeenCalled();
  });

  it("runs the daily sync with the secret and returns a token-free summary", async () => {
    const deps = cronDeps();
    const response = await handleCron(cronRequest(`Bearer ${SECRET}`), "youtube", deps);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "success", runId: "run-1", done: true, rowsWritten: 4, errors: 0 });
    expect(deps.repo.createRun).toHaveBeenCalledWith(expect.objectContaining({ platform: "youtube", job: "daily" }));
    expect(JSON.stringify(body)).not.toMatch(/token/i);
  });

  it("reports skipped when the platform has no syncer", async () => {
    const response = await handleCron(cronRequest(`Bearer ${SECRET}`), "tiktok", cronDeps({ getSyncer: () => null }));
    expect(await response.json()).toEqual({ status: "skipped", reason: "no_syncer", done: true });
  });
});

function backfillDeps(overrides: Partial<BackfillDeps> = {}): BackfillDeps {
  return {
    repo: repo(),
    getSyncer: () => syncer,
    isAuthorized: async () => true,
    getAccountPlatform: async () => "youtube",
    ...overrides,
  };
}

const backfillRequest = (body: unknown) =>
  new Request("http://localhost:3000/api/sync/backfill", { method: "POST", body: JSON.stringify(body) });

describe("handleBackfill", () => {
  it("requires the allowed session", async () => {
    const response = await handleBackfill(backfillRequest({ accountId: ACCOUNT_ID }), backfillDeps({ isAuthorized: async () => false }));
    expect(response.status).toBe(401);
  });

  it("validates the body and the account", async () => {
    expect((await handleBackfill(backfillRequest({ accountId: "x" }), backfillDeps())).status).toBe(400);
    expect(
      (await handleBackfill(backfillRequest({ accountId: ACCOUNT_ID }), backfillDeps({ getAccountPlatform: async () => null }))).status,
    ).toBe(404);
  });

  it("processes one backfill block for the account and returns done and cursor", async () => {
    const deps = backfillDeps();
    const response = await handleBackfill(backfillRequest({ accountId: ACCOUNT_ID }), deps);
    expect(await response.json()).toMatchObject({ done: true, cursor: null, progress: 1, status: "success" });
    expect(deps.repo.createRun).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "youtube", job: "backfill", accountId: ACCOUNT_ID }),
    );
  });
});
