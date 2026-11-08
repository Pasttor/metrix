import { getEnv } from "@/lib/env";
import type { PlatformConnector } from "@/lib/oauth/connector";
import type { ConnectPlatform } from "@/lib/oauth/types";
import { createYouTubeConnector } from "./youtube/connector";

/**
 * Connector per provider. Each one is added by its task (YouTube in T05,
 * Meta in T08, TikTok in T13) and returns null until its credentials exist.
 */
const factories: Partial<Record<ConnectPlatform, () => PlatformConnector | null>> = {
  youtube() {
    const env = getEnv();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
    return createYouTubeConnector({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      monetary: env.YOUTUBE_MONETARY,
    });
  },
};

export function getConnector(platform: ConnectPlatform): PlatformConnector | null {
  return factories[platform]?.() ?? null;
}
