import "server-only";
import { createClient } from "@/lib/db/server";
import { connectPlatformFor, type AccountPlatform, type ConnectPlatform } from "@/lib/oauth/types";
import { getConnector } from "@/lib/platforms/registry";

export type ConnectionAccount = {
  id: string;
  platform: AccountPlatform;
  name: string | null;
  handle: string | null;
  avatarUrl: string | null;
  status: "active" | "reauth_required" | "disabled";
  lastSyncedAt: string | null;
};

export type ConnectionStatus = "disconnected" | "connected" | "reauth_required";

export type ConnectionCardData = {
  platform: AccountPlatform;
  label: string;
  connectPlatform: ConnectPlatform;
  configured: boolean;
  status: ConnectionStatus;
  lastSyncedAt: string | null;
  accounts: ConnectionAccount[];
};

const CARDS: { platform: AccountPlatform; label: string }[] = [
  { platform: "youtube", label: "YouTube" },
  { platform: "instagram", label: "Instagram" },
  { platform: "facebook", label: "Facebook" },
  { platform: "tiktok", label: "TikTok" },
  { platform: "drive", label: "Google Drive" },
];

export function summarize(accounts: ConnectionAccount[]): { status: ConnectionStatus; lastSyncedAt: string | null } {
  const live = accounts.filter((account) => account.status !== "disabled");
  if (live.length === 0) return { status: "disconnected", lastSyncedAt: null };
  const status = live.some((account) => account.status === "reauth_required") ? "reauth_required" : "connected";
  const lastSyncedAt = live.reduce<string | null>(
    (latest, account) => (account.lastSyncedAt && (!latest || account.lastSyncedAt > latest) ? account.lastSyncedAt : latest),
    null,
  );
  return { status, lastSyncedAt };
}

/** Read with the user's session (RLS). Selects explicit columns: no token data. */
export async function listConnectionCards(): Promise<ConnectionCardData[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, platform, name, handle, avatar_url, status, last_synced_at")
    .order("connected_at");
  if (error) throw new Error(`Could not load accounts (${error.code})`);

  const accounts: ConnectionAccount[] = (data ?? []).map((row) => ({
    id: row.id,
    platform: row.platform as AccountPlatform,
    name: row.name,
    handle: row.handle,
    avatarUrl: row.avatar_url,
    status: row.status as ConnectionAccount["status"],
    lastSyncedAt: row.last_synced_at,
  }));

  return CARDS.map(({ platform, label }) => {
    const own = accounts.filter((account) => account.platform === platform);
    const connectPlatform = connectPlatformFor(platform);
    return {
      platform,
      label,
      connectPlatform,
      configured: getConnector(connectPlatform) !== null,
      accounts: own,
      ...summarize(own),
    };
  });
}
