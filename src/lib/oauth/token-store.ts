import { decrypt, encrypt } from "@/lib/crypto";
import type { OAuthTokens } from "./types";

/** Refresh tokens this close to expiry. */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export type TokenRow = {
  account_id: string;
  access_token_enc: string;
  refresh_token_enc: string | null;
  expires_at: string | null;
  refresh_expires_at: string | null;
  scopes: string[];
  updated_at: string;
};

export interface TokenRepo {
  upsert(row: TokenRow): Promise<void>;
  get(accountId: string): Promise<TokenRow | null>;
  setAccountStatus(accountId: string, status: "active" | "reauth_required"): Promise<void>;
}

/** Per-platform refresh. Throw RefreshRejectedError when the provider says the grant is gone. */
export type RefreshFn = (refreshToken: string) => Promise<OAuthTokens>;

export class RefreshRejectedError extends Error {
  constructor(message = "Refresh token rejected by the provider") {
    super(message);
    this.name = "RefreshRejectedError";
  }
}

export class ReauthRequiredError extends Error {
  constructor(readonly accountId: string) {
    super("Account must be reconnected");
    this.name = "ReauthRequiredError";
  }
}

export function createTokenStore(
  repo: TokenRepo,
  options: { key?: string; now?: () => Date } = {},
) {
  const now = options.now ?? (() => new Date());
  const enc = (value: string) => encrypt(value, options.key);
  const dec = (value: string) => decrypt(value, options.key);

  async function saveTokens(accountId: string, tokens: OAuthTokens, previous?: TokenRow | null) {
    await repo.upsert({
      account_id: accountId,
      access_token_enc: enc(tokens.accessToken),
      // Providers often omit the refresh token on refresh: keep the old one.
      refresh_token_enc: tokens.refreshToken ? enc(tokens.refreshToken) : (previous?.refresh_token_enc ?? null),
      expires_at: tokens.expiresAt?.toISOString() ?? null,
      refresh_expires_at:
        tokens.refreshExpiresAt?.toISOString() ?? (tokens.refreshToken ? null : (previous?.refresh_expires_at ?? null)),
      scopes: tokens.scopes ?? previous?.scopes ?? [],
      updated_at: now().toISOString(),
    });
  }

  async function markReauthRequired(accountId: string) {
    await repo.setAccountStatus(accountId, "reauth_required");
  }

  async function failReauth(accountId: string): Promise<never> {
    await markReauthRequired(accountId);
    throw new ReauthRequiredError(accountId);
  }

  async function getValidAccessToken(accountId: string, refresh?: RefreshFn): Promise<string> {
    const row = await repo.get(accountId);
    if (!row) return failReauth(accountId);

    const current = now().getTime();
    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
    if (expiresAt === null || expiresAt - current > REFRESH_MARGIN_MS) {
      return dec(row.access_token_enc);
    }

    const refreshExpired = row.refresh_expires_at !== null && new Date(row.refresh_expires_at).getTime() <= current;
    if (!refresh || !row.refresh_token_enc || refreshExpired) return failReauth(accountId);

    let tokens: OAuthTokens;
    try {
      tokens = await refresh(dec(row.refresh_token_enc));
    } catch (error) {
      if (error instanceof RefreshRejectedError) return failReauth(accountId);
      throw error; // Network or provider outage: retry on the next run.
    }

    await saveTokens(accountId, tokens, row);
    return tokens.accessToken;
  }

  return { saveTokens: (accountId: string, tokens: OAuthTokens) => saveTokens(accountId, tokens), getValidAccessToken, markReauthRequired };
}

export type TokenStore = ReturnType<typeof createTokenStore>;
