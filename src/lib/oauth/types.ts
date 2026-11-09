/** Platforms stored in `accounts.platform`. */
/** "drive" is Google Drive for publishing: it is connected but never synced. */
export const ACCOUNT_PLATFORMS = ["youtube", "instagram", "facebook", "tiktok", "drive"] as const;
export type AccountPlatform = (typeof ACCOUNT_PLATFORMS)[number];

/** OAuth providers: Meta connects both the Facebook Page and its Instagram account. */
export const CONNECT_PLATFORMS = ["youtube", "meta", "tiktok", "drive"] as const;
export type ConnectPlatform = (typeof CONNECT_PLATFORMS)[number];

export function isConnectPlatform(value: string): value is ConnectPlatform {
  return (CONNECT_PLATFORMS as readonly string[]).includes(value);
}

export const ACCOUNT_PLATFORMS_BY_CONNECT: Record<ConnectPlatform, AccountPlatform[]> = {
  youtube: ["youtube"],
  meta: ["facebook", "instagram"],
  tiktok: ["tiktok"],
  drive: ["drive"],
};

export function connectPlatformFor(platform: AccountPlatform): ConnectPlatform {
  return platform === "facebook" || platform === "instagram" ? "meta" : platform;
}

export type OAuthTokens = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  refreshExpiresAt?: Date | null;
  scopes?: string[];
};
