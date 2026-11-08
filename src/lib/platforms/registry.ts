import type { PlatformConnector } from "@/lib/oauth/connector";
import type { ConnectPlatform } from "@/lib/oauth/types";

/**
 * Connector per provider. Each one is added by its task (YouTube in T05,
 * Meta in T08, TikTok in T13) and returns null until its credentials exist.
 */
const factories: Partial<Record<ConnectPlatform, () => PlatformConnector | null>> = {};

export function getConnector(platform: ConnectPlatform): PlatformConnector | null {
  return factories[platform]?.() ?? null;
}
