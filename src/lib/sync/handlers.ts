import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectPlatformFor, type AccountPlatform } from "@/lib/oauth/types";
import { runSync, type RunSyncDeps, type RunSyncResult } from "./runner";
import type { SyncPlatform } from "./types";

/** Time budget per invocation, below the function limit (maxDuration = 300 s). */
export const CRON_BUDGET_MS = 240_000;
/** Backfill blocks are short so the UI can show progress. */
export const BACKFILL_BLOCK_MS = 45_000;

export function isValidCronAuth(header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Public shape of a run: counts only, never tokens or raw API payloads. */
export function summarizeRun(result: RunSyncResult) {
  if (result.status === "skipped") return { status: result.status, reason: result.reason, done: true };
  return {
    status: result.status,
    runId: result.runId,
    done: result.done,
    cursor: result.cursor,
    progress: result.stats.progress,
    rowsWritten: result.stats.rowsWritten,
    warnings: result.stats.warnings.length,
    errors: result.stats.errors.length,
  };
}

export type CronDeps = RunSyncDeps & {
  cronSecret: string;
  /** Runs after each cron sync (in-app alerts); its failure never fails the cron. */
  afterRun?: () => Promise<unknown>;
};

export async function handleCron(request: Request, platform: SyncPlatform, deps: CronDeps): Promise<Response> {
  if (!isValidCronAuth(request.headers.get("authorization"), deps.cronSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = deps.now ?? (() => new Date());
  const result = await runSync({ platform, job: "daily", deadline: new Date(now().getTime() + CRON_BUDGET_MS) }, deps);
  await deps.afterRun?.().catch((error: unknown) => console.warn(`[cron] after-run step failed: ${error instanceof Error ? error.name : "unknown"}`));
  return NextResponse.json(summarizeRun(result));
}

const backfillBody = z.object({ accountId: z.uuid() });

export type BackfillDeps = RunSyncDeps & {
  isAuthorized: () => Promise<boolean>;
  getAccountPlatform: (accountId: string) => Promise<AccountPlatform | null>;
};

/** Processes one block of the account's backfill; the UI calls it until done. */
export async function handleBackfill(request: Request, deps: BackfillDeps): Promise<Response> {
  if (!(await deps.isAuthorized())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = backfillBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const accountPlatform = await deps.getAccountPlatform(parsed.data.accountId);
  if (!accountPlatform) return NextResponse.json({ error: "account_not_found" }, { status: 404 });

  const now = deps.now ?? (() => new Date());
  const result = await runSync(
    {
      platform: connectPlatformFor(accountPlatform),
      job: "backfill",
      accountId: parsed.data.accountId,
      deadline: new Date(now().getTime() + BACKFILL_BLOCK_MS),
    },
    deps,
  );
  return NextResponse.json(summarizeRun(result));
}
