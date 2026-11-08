import { describe, expect, it, vi } from "vitest";
import type { Json } from "@/lib/db/types";
import { ReauthRequiredError } from "@/lib/oauth/token-store";
import { runSync } from "./runner";
import type { AccountSyncInput, AccountSyncResult, RunCursor, SyncAccount, SyncRepo, Syncer } from "./types";

type RunRow = {
  id: string;
  platform: string;
  job: string;
  accountId: string | null;
  status: string;
  cursor: RunCursor | null;
  stats?: unknown;
  error?: string | null;
};

const ACCOUNTS: SyncAccount[] = [
  { id: "a1", platform: "facebook", externalId: "page-1", name: "Página" },
  { id: "a2", platform: "instagram", externalId: "ig-1", name: "casiquiebra" },
  { id: "a3", platform: "youtube", externalId: "UC1", name: "Canal" },
];

function memoryRepo() {
  const runs: RunRow[] = [];
  const synced: string[] = [];
  const repo: SyncRepo = {
    async listAccounts(platforms, accountId) {
      return ACCOUNTS.filter((a) => platforms.includes(a.platform) && (!accountId || a.id === accountId));
    },
    async findResumableCursor({ platform, job, accountId }) {
      const latest = runs.filter((r) => r.platform === platform && r.job === job && r.accountId === accountId).at(-1);
      return latest?.status === "partial" ? latest.cursor : null;
    },
    async createRun({ platform, job, accountId }) {
      const id = `run-${runs.length + 1}`;
      runs.push({ id, platform, job, accountId, status: "running", cursor: null });
      return id;
    },
    async finishRun(id, result) {
      Object.assign(runs.find((r) => r.id === id)!, result);
    },
    async markSynced(accountId) {
      synced.push(accountId);
    },
  };
  return { repo, runs, synced };
}

/** Fake clock that advances `step` ms every time it is read. */
function clock(step = 0) {
  let t = new Date("2026-11-08T10:00:00Z").getTime();
  return () => {
    const value = new Date(t);
    t += step;
    return value;
  };
}

const ok = (rows = 1): AccountSyncResult => ({ done: true, rowsWritten: rows, warnings: [] });

function syncer(fn: (input: AccountSyncInput) => Promise<AccountSyncResult>): Syncer {
  return { syncAccount: vi.fn(fn) };
}

const farFuture = new Date("2030-01-01T00:00:00Z");

describe("runSync", () => {
  it("syncs every account of the platform and ends in success", async () => {
    const { repo, runs, synced } = memoryRepo();
    const fake = syncer(async () => ({ ...ok(5), warnings: ["métrica x retirada"], quotaUnits: 3 }));

    const result = await runSync({ platform: "meta", job: "daily", deadline: farFuture }, { repo, getSyncer: () => fake, now: clock() });

    expect(result.status).toBe("success");
    expect(synced).toEqual(["a1", "a2"]);
    expect(runs[0]).toMatchObject({ status: "success", cursor: null });
    if (result.status === "skipped") throw new Error("unexpected");
    expect(result.stats).toMatchObject({ rowsWritten: 10, quotaUnits: 6, accountsTotal: 2, accountsDone: 2, progress: 1 });
    expect(result.stats.warnings).toEqual(["Página: métrica x retirada", "casiquiebra: métrica x retirada"]);
  });

  it("keeps going when one account fails and ends partial", async () => {
    const { repo, runs, synced } = memoryRepo();
    const fake = syncer(async ({ account }) => {
      if (account.id === "a1") throw new Error("Graph API 500");
      return ok();
    });

    const result = await runSync({ platform: "meta", job: "daily", deadline: farFuture }, { repo, getSyncer: () => fake, now: clock() });

    expect(result.status).toBe("partial");
    expect(synced).toEqual(["a2"]);
    expect(runs[0].stats).toMatchObject({ errors: [{ accountId: "a1", message: "Error: Graph API 500" }] });
    // An error-partial has no cursor, so the next run starts over.
    expect(runs[0].cursor).toBeNull();
  });

  it("ends in error when every account fails", async () => {
    const { repo, runs } = memoryRepo();
    const fake = syncer(async ({ account }) => {
      throw new ReauthRequiredError(account.id);
    });
    const result = await runSync({ platform: "meta", job: "daily", deadline: farFuture }, { repo, getSyncer: () => fake, now: clock() });
    expect(result.status).toBe("error");
    expect(runs[0].error).toBe("La cuenta necesita reconectarse");
  });

  it("stops at the deadline with a cursor and resumes from it on the next run", async () => {
    const { repo, runs, synced } = memoryRepo();
    const seen: { account: string; cursor: Json | null }[] = [];

    // Account a1 needs two blocks: the first stops when shouldStop() turns true.
    const fake = syncer(async ({ account, cursor, shouldStop }) => {
      seen.push({ account: account.id, cursor });
      if (account.id === "a1" && cursor === null) {
        while (!shouldStop()) {
          /* fetching pages until the deadline */
        }
        return { done: false, cursor: { page: 2 }, rowsWritten: 3, warnings: [], progress: 0.5 };
      }
      return ok(2);
    });

    const now = clock(10_000); // each clock read advances 10 s
    const first = await runSync(
      { platform: "meta", job: "backfill", deadline: new Date("2026-11-08T10:00:40Z") },
      { repo, getSyncer: () => fake, now },
    );

    expect(first.status).toBe("partial");
    if (first.status === "skipped") throw new Error("unexpected");
    expect(first.done).toBe(false);
    expect(first.cursor).toEqual({ pending: ["a1", "a2"], current: { accountId: "a1", cursor: { page: 2 } } });
    expect(first.stats.progress).toBeCloseTo(0.25);
    expect(runs[0].cursor).toEqual(first.cursor);

    const second = await runSync({ platform: "meta", job: "backfill", deadline: farFuture }, { repo, getSyncer: () => fake, now: clock() });

    expect(second.status).toBe("success");
    expect(seen).toEqual([
      { account: "a1", cursor: null },
      { account: "a1", cursor: { page: 2 } },
      { account: "a2", cursor: null },
    ]);
    expect(synced).toEqual(["a1", "a2"]);
  });

  it("saves a cursor without calling the syncer when the deadline already passed", async () => {
    const { repo } = memoryRepo();
    const fake = syncer(async () => ok());
    const result = await runSync(
      { platform: "meta", job: "daily", deadline: new Date("2026-11-08T09:00:00Z") },
      { repo, getSyncer: () => fake, now: clock() },
    );
    expect(result).toMatchObject({ status: "partial", done: false, cursor: { pending: ["a1", "a2"] } });
    expect(fake.syncAccount).not.toHaveBeenCalled();
  });

  it("can target a single account", async () => {
    const { repo, synced, runs } = memoryRepo();
    const fake = syncer(async () => ok());
    await runSync({ platform: "meta", job: "daily", accountId: "a2", deadline: farFuture }, { repo, getSyncer: () => fake, now: clock() });
    expect(synced).toEqual(["a2"]);
    expect(runs[0].accountId).toBe("a2");
  });

  it("succeeds with nothing to do when no accounts are connected", async () => {
    const { repo } = memoryRepo();
    const result = await runSync({ platform: "tiktok", job: "daily", deadline: farFuture }, { repo, getSyncer: () => syncer(async () => ok()), now: clock() });
    expect(result).toMatchObject({ status: "success", done: true });
  });

  it("skips without creating a run when the platform has no syncer yet", async () => {
    const { repo, runs } = memoryRepo();
    const result = await runSync({ platform: "youtube", job: "daily", deadline: farFuture }, { repo, getSyncer: () => null });
    expect(result).toEqual({ status: "skipped", reason: "no_syncer" });
    expect(runs).toHaveLength(0);
  });

  it("closes the run as error when bookkeeping fails", async () => {
    const { repo, runs } = memoryRepo();
    repo.markSynced = async () => {
      throw new Error("db down");
    };
    await expect(
      runSync({ platform: "youtube", job: "daily", deadline: farFuture }, { repo, getSyncer: () => syncer(async () => ok()), now: clock() }),
    ).rejects.toThrow("db down");
    expect(runs[0]).toMatchObject({ status: "error", error: "Error: db down" });
  });
});
