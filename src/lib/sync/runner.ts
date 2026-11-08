import type { Json } from "@/lib/db/types";
import { ReauthRequiredError } from "@/lib/oauth/token-store";
import { ACCOUNT_PLATFORMS_BY_CONNECT } from "@/lib/oauth/types";
import type { RunCursor, RunStats, RunStatus, SyncJob, SyncPlatform, SyncRepo, Syncer } from "./types";

export type RunSyncInput = {
  platform: SyncPlatform;
  job: SyncJob;
  accountId?: string;
  /** Stop and save a cursor once this time is reached. */
  deadline: Date;
};

export type RunSyncDeps = {
  repo: SyncRepo;
  getSyncer: (platform: SyncPlatform) => Syncer | null;
  now?: () => Date;
};

export type RunSyncResult =
  | { status: "skipped"; reason: "no_syncer" }
  | { status: RunStatus; runId: string; done: boolean; cursor: RunCursor | null; stats: RunStats };

const MAX_ERROR_LENGTH = 300;

function errorMessage(error: unknown): string {
  if (error instanceof ReauthRequiredError) return "La cuenta necesita reconectarse";
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

/**
 * Runs one platform's syncer for each active account. A failing account does
 * not stop the others. Near the deadline it saves a cursor and ends `partial`;
 * the next run for the same platform/job/account continues from there.
 */
export async function runSync(input: RunSyncInput, deps: RunSyncDeps): Promise<RunSyncResult> {
  const now = deps.now ?? (() => new Date());
  const syncer = deps.getSyncer(input.platform);
  if (!syncer) return { status: "skipped", reason: "no_syncer" };

  const accountKey = input.accountId ?? null;
  const accounts = await deps.repo.listAccounts(ACCOUNT_PLATFORMS_BY_CONNECT[input.platform], input.accountId);
  const byId = new Map(accounts.map((account) => [account.id, account]));

  const resumed = await deps.repo.findResumableCursor({ platform: input.platform, job: input.job, accountId: accountKey });
  let pending = resumed ? resumed.pending.filter((id) => byId.has(id)) : accounts.map((account) => account.id);
  let current = resumed?.current && byId.has(resumed.current.accountId) ? resumed.current : undefined;

  const stats: RunStats = {
    rowsWritten: 0,
    warnings: [],
    errors: [],
    accountsTotal: pending.length,
    accountsDone: 0,
    quotaUnits: 0,
    progress: 0,
  };

  const runId = await deps.repo.createRun({ platform: input.platform, job: input.job, accountId: accountKey, startedAt: now() });
  const shouldStop = () => now().getTime() >= input.deadline.getTime();

  let cut = false;
  let accountProgress = 0;

  try {
    while (pending.length > 0) {
      if (shouldStop()) {
        cut = true;
        break;
      }

      const account = byId.get(pending[0])!;
      const cursor: Json | null = current?.accountId === account.id ? current.cursor : null;

      // Only the syncer's own failure counts against the account; bookkeeping
      // errors below propagate and close the whole run as error.
      let result;
      try {
        result = await syncer.syncAccount({ account, job: input.job, cursor, shouldStop, now: now() });
      } catch (error) {
        stats.errors.push({ accountId: account.id, message: errorMessage(error) });
        pending = pending.slice(1);
        current = undefined;
        accountProgress = 0;
        continue;
      }

      stats.rowsWritten += result.rowsWritten;
      stats.quotaUnits += result.quotaUnits ?? 0;
      stats.warnings.push(...result.warnings.map((warning) => `${account.name ?? account.id}: ${warning}`));

      if (!result.done) {
        current = { accountId: account.id, cursor: result.cursor ?? null };
        accountProgress = result.progress ?? 0;
        cut = true;
        break;
      }

      await deps.repo.markSynced(account.id, now());
      pending = pending.slice(1);
      current = undefined;
      stats.accountsDone += 1;
      accountProgress = 0;
    }
  } catch (error) {
    // Bookkeeping failure (e.g. database): close the run as error and rethrow.
    await deps.repo.finishRun(runId, {
      status: "error",
      stats,
      cursor: null,
      error: errorMessage(error),
      finishedAt: now(),
    });
    throw error;
  }

  const handled = stats.accountsDone + stats.errors.length;
  stats.progress = stats.accountsTotal === 0 ? 1 : Math.min(1, (handled + accountProgress) / stats.accountsTotal);

  const cursor: RunCursor | null = cut ? { pending, ...(current ? { current } : {}) } : null;
  const allFailed = stats.accountsTotal > 0 && stats.errors.length === stats.accountsTotal;
  const status: RunStatus = cut ? "partial" : allFailed ? "error" : stats.errors.length > 0 ? "partial" : "success";

  await deps.repo.finishRun(runId, {
    status,
    stats,
    cursor,
    error: allFailed ? stats.errors[0].message : null,
    finishedAt: now(),
  });

  return { status, runId, done: !cut, cursor, stats };
}
