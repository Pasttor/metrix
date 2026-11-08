import type { Json } from "@/lib/db/types";
import type { AccountPlatform, ConnectPlatform } from "@/lib/oauth/types";

/** A sync run covers one provider: 'meta' syncs the Facebook Page and Instagram together. */
export type SyncPlatform = ConnectPlatform;

export type SyncJob = "daily" | "backfill";

export type SyncAccount = {
  id: string;
  platform: AccountPlatform;
  externalId: string;
  name: string | null;
};

export type AccountSyncInput = {
  account: SyncAccount;
  job: SyncJob;
  /** Where the previous block stopped for this account, or null to start. */
  cursor: Json | null;
  /** True once the run is close to its deadline: save a cursor and return done=false. */
  shouldStop: () => boolean;
  now: Date;
};

export type AccountSyncResult = {
  done: boolean;
  /** Required when done is false. */
  cursor?: Json;
  rowsWritten: number;
  warnings: string[];
  /** 0..1 within this account, for backfill progress. */
  progress?: number;
  /** Estimated API quota spent (YouTube units, Meta calls...). */
  quotaUnits?: number;
};

/** Per-platform sync logic (YouTube in T06, Meta in T09/T10, TikTok in T13). */
export interface Syncer {
  syncAccount(input: AccountSyncInput): Promise<AccountSyncResult>;
}

/** Saved in sync_runs.cursor to resume a run cut by the deadline. */
export type RunCursor = {
  pending: string[];
  current?: { accountId: string; cursor: Json };
};

export type RunStats = {
  rowsWritten: number;
  warnings: string[];
  errors: { accountId: string; message: string }[];
  accountsTotal: number;
  accountsDone: number;
  quotaUnits: number;
  progress: number;
};

export type RunStatus = "success" | "partial" | "error";

export interface SyncRepo {
  /** Active accounts of these platforms (optionally just one). */
  listAccounts(platforms: AccountPlatform[], accountId?: string): Promise<SyncAccount[]>;
  /** Cursor of the latest run for this key, if it stopped partway. */
  findResumableCursor(key: { platform: SyncPlatform; job: SyncJob; accountId: string | null }): Promise<RunCursor | null>;
  createRun(input: { platform: SyncPlatform; job: SyncJob; accountId: string | null; startedAt: Date }): Promise<string>;
  finishRun(
    id: string,
    result: { status: RunStatus; stats: RunStats; cursor: RunCursor | null; error: string | null; finishedAt: Date },
  ): Promise<void>;
  markSynced(accountId: string, at: Date): Promise<void>;
}
