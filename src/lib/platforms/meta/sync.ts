import type { AccountSyncInput, AccountSyncResult, Syncer } from "@/lib/sync/types";

/**
 * One Meta run covers the Facebook Page and its Instagram account. Each account
 * goes to its own syncer; a platform without one yet (Facebook until T10) is
 * left untouched.
 */
export function createMetaSyncer(syncers: { instagram?: Syncer; facebook?: Syncer }): Syncer {
  return {
    async syncAccount(input: AccountSyncInput): Promise<AccountSyncResult> {
      const syncer = input.account.platform === "instagram" ? syncers.instagram : input.account.platform === "facebook" ? syncers.facebook : undefined;
      if (!syncer) return { done: true, rowsWritten: 0, warnings: [], progress: 1 };
      return syncer.syncAccount(input);
    },
  };
}
