import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  codeChallengeS256,
  consumeOAuthState,
  createOAuthState,
  OAuthStateError,
  STATE_TTL_MS,
  type OAuthStateRow,
  type OAuthStateStore,
} from "./state";

function memoryStore() {
  const rows = new Map<string, OAuthStateRow>();
  const store: OAuthStateStore = {
    async insert(row) {
      rows.set(row.state, row);
    },
    async take(state) {
      const row = rows.get(state) ?? null;
      rows.delete(state);
      return row;
    },
    async purge(before) {
      for (const [key, row] of rows) if (new Date(row.created_at) < before) rows.delete(key);
    },
  };
  return { store, rows };
}

const t0 = new Date("2026-11-08T12:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);

describe("OAuth state", () => {
  it("accepts a fresh state once and returns its PKCE verifier", async () => {
    const { store } = memoryStore();
    const { state, codeVerifier, codeChallenge } = await createOAuthState(store, "youtube", t0);

    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(codeChallenge).toBe(codeChallengeS256(codeVerifier));
    await expect(consumeOAuthState(store, state, "youtube", later(60_000))).resolves.toBe(codeVerifier);
  });

  it("rejects a reused state", async () => {
    const { store } = memoryStore();
    const { state } = await createOAuthState(store, "youtube", t0);
    await consumeOAuthState(store, state, "youtube", t0);
    await expect(consumeOAuthState(store, state, "youtube", t0)).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("rejects a state older than 10 minutes and deletes it", async () => {
    const { store, rows } = memoryStore();
    const { state } = await createOAuthState(store, "youtube", t0);
    await expect(consumeOAuthState(store, state, "youtube", later(STATE_TTL_MS + 1))).rejects.toMatchObject({
      code: "expired_state",
    });
    expect(rows.size).toBe(0);
  });

  it("rejects unknown, missing or cross-platform states", async () => {
    const { store } = memoryStore();
    const { state } = await createOAuthState(store, "meta", t0);
    await expect(consumeOAuthState(store, "nope", "meta", t0)).rejects.toBeInstanceOf(OAuthStateError);
    await expect(consumeOAuthState(store, null, "meta", t0)).rejects.toMatchObject({ code: "invalid_state" });
    await expect(consumeOAuthState(store, state, "youtube", t0)).rejects.toMatchObject({ code: "platform_mismatch" });
  });

  it("purges expired states when a new one is created", async () => {
    const { store, rows } = memoryStore();
    await createOAuthState(store, "youtube", t0);
    await createOAuthState(store, "tiktok", later(STATE_TTL_MS + 1));
    expect(rows.size).toBe(1);
  });
});

describe("codeChallengeS256", () => {
  it("is the unpadded base64url SHA-256 of the verifier", () => {
    const verifier = "a".repeat(43);
    const expected = createHash("sha256").update(verifier).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(codeChallengeS256(verifier)).toBe(expected);
  });
});
