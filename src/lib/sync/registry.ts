import { getConnector } from "@/lib/platforms/registry";
import { metaSyncer } from "@/lib/platforms/meta/deps";
import { youtubeSyncer } from "@/lib/platforms/youtube/deps";
import type { SyncPlatform, Syncer } from "./types";

/**
 * Syncer per provider, added by each sync task (YouTube T06, Meta T09/T10,
 * TikTok T13). Until then, or without credentials, runs are skipped.
 */
const syncers: Partial<Record<SyncPlatform, () => Syncer | null>> = {
  youtube() {
    const connector = getConnector("youtube");
    return connector ? youtubeSyncer(connector) : null;
  },
  meta() {
    return getConnector("meta") ? metaSyncer() : null;
  },
};

export function getSyncer(platform: SyncPlatform): Syncer | null {
  return syncers[platform]?.() ?? null;
}

export function hasSyncer(platform: SyncPlatform): boolean {
  return getSyncer(platform) !== null;
}
