import type { SyncPlatform, Syncer } from "./types";

/**
 * Syncer per provider, added by each sync task (YouTube T06, Meta T09/T10,
 * TikTok T13). Until then runs are skipped.
 */
const syncers: Partial<Record<SyncPlatform, () => Syncer | null>> = {};

export function getSyncer(platform: SyncPlatform): Syncer | null {
  return syncers[platform]?.() ?? null;
}

export function hasSyncer(platform: SyncPlatform): boolean {
  return getSyncer(platform) !== null;
}
