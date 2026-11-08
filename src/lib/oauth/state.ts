import { createHash, randomBytes } from "node:crypto";
import type { ConnectPlatform } from "./types";

/** OAuth `state` + PKCE verifier, single use, valid for 10 minutes. */

export const STATE_TTL_MS = 10 * 60 * 1000;

export type OAuthStateRow = {
  state: string;
  platform: ConnectPlatform;
  code_verifier: string;
  created_at: string;
};

export interface OAuthStateStore {
  insert(row: OAuthStateRow): Promise<void>;
  /** Deletes and returns the row, so a state can only be used once. */
  take(state: string): Promise<OAuthStateRow | null>;
  /** Removes states created before `before`. */
  purge(before: Date): Promise<void>;
}

export function generateCodeVerifier(): string {
  // 32 random bytes -> 43 base64url chars (RFC 7636 allows 43-128).
  return randomBytes(32).toString("base64url");
}

export function codeChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export type OAuthStateErrorCode = "invalid_state" | "expired_state" | "platform_mismatch";

export class OAuthStateError extends Error {
  constructor(readonly code: OAuthStateErrorCode) {
    super(`OAuth state rejected: ${code}`);
    this.name = "OAuthStateError";
  }
}

export async function createOAuthState(
  store: OAuthStateStore,
  platform: ConnectPlatform,
  now: Date = new Date(),
): Promise<{ state: string; codeVerifier: string; codeChallenge: string }> {
  await store.purge(new Date(now.getTime() - STATE_TTL_MS));

  const state = randomBytes(32).toString("base64url");
  const codeVerifier = generateCodeVerifier();
  await store.insert({ state, platform, code_verifier: codeVerifier, created_at: now.toISOString() });

  return { state, codeVerifier, codeChallenge: codeChallengeS256(codeVerifier) };
}

/** Validates and deletes the state; returns the PKCE verifier. */
export async function consumeOAuthState(
  store: OAuthStateStore,
  state: string | null,
  platform: ConnectPlatform,
  now: Date = new Date(),
): Promise<string> {
  if (!state) throw new OAuthStateError("invalid_state");

  const row = await store.take(state);
  if (!row) throw new OAuthStateError("invalid_state");
  if (row.platform !== platform) throw new OAuthStateError("platform_mismatch");
  if (now.getTime() - new Date(row.created_at).getTime() > STATE_TTL_MS) {
    throw new OAuthStateError("expired_state");
  }
  return row.code_verifier;
}
