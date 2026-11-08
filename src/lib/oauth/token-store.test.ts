import { describe, expect, it, vi } from "vitest";
import { decrypt } from "@/lib/crypto";
import {
  createTokenStore,
  ReauthRequiredError,
  RefreshRejectedError,
  type TokenRepo,
  type TokenRow,
} from "./token-store";

const key = Buffer.alloc(32, 3).toString("base64");
const NOW = new Date("2026-11-08T12:00:00Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

function memoryRepo() {
  const tokens = new Map<string, TokenRow>();
  const statuses = new Map<string, string>();
  const repo: TokenRepo = {
    async upsert(row) {
      tokens.set(row.account_id, row);
    },
    async get(accountId) {
      return tokens.get(accountId) ?? null;
    },
    async setAccountStatus(accountId, status) {
      statuses.set(accountId, status);
    },
  };
  return { repo, tokens, statuses };
}

function setup() {
  const memory = memoryRepo();
  const store = createTokenStore(memory.repo, { key, now: () => NOW });
  return { ...memory, store };
}

describe("tokenStore", () => {
  it("stores tokens encrypted", async () => {
    const { store, tokens } = setup();
    await store.saveTokens("acc", { accessToken: "access-1", refreshToken: "refresh-1", expiresAt: minutes(60) });
    const row = tokens.get("acc")!;
    expect(row.access_token_enc).not.toContain("access-1");
    expect(row.refresh_token_enc).not.toContain("refresh-1");
    expect(decrypt(row.access_token_enc, key)).toBe("access-1");
  });

  it("returns the current token while it has more than 5 minutes left", async () => {
    const { store } = setup();
    await store.saveTokens("acc", { accessToken: "access-1", refreshToken: "refresh-1", expiresAt: minutes(6) });
    const refresh = vi.fn();
    await expect(store.getValidAccessToken("acc", refresh)).resolves.toBe("access-1");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes when less than 5 minutes are left and keeps the old refresh token if none comes back", async () => {
    const { store, tokens } = setup();
    await store.saveTokens("acc", { accessToken: "access-1", refreshToken: "refresh-1", expiresAt: minutes(4) });
    const refresh = vi.fn().mockResolvedValue({ accessToken: "access-2", expiresAt: minutes(60) });

    await expect(store.getValidAccessToken("acc", refresh)).resolves.toBe("access-2");
    expect(refresh).toHaveBeenCalledWith("refresh-1");
    expect(decrypt(tokens.get("acc")!.access_token_enc, key)).toBe("access-2");
    expect(decrypt(tokens.get("acc")!.refresh_token_enc!, key)).toBe("refresh-1");
  });

  it("saves a rotated refresh token", async () => {
    const { store, tokens } = setup();
    await store.saveTokens("acc", { accessToken: "a1", refreshToken: "r1", expiresAt: minutes(-1) });
    await store.getValidAccessToken("acc", async () => ({ accessToken: "a2", refreshToken: "r2", expiresAt: minutes(60) }));
    expect(decrypt(tokens.get("acc")!.refresh_token_enc!, key)).toBe("r2");
  });

  it("treats tokens without expiry (Facebook Page tokens) as always valid", async () => {
    const { store } = setup();
    await store.saveTokens("page", { accessToken: "page-token" });
    await expect(store.getValidAccessToken("page")).resolves.toBe("page-token");
  });

  it("marks the account for reauth when the provider rejects the refresh token", async () => {
    const { store, statuses } = setup();
    await store.saveTokens("acc", { accessToken: "a1", refreshToken: "r1", expiresAt: minutes(1) });
    const refresh = vi.fn().mockRejectedValue(new RefreshRejectedError());
    await expect(store.getValidAccessToken("acc", refresh)).rejects.toBeInstanceOf(ReauthRequiredError);
    expect(statuses.get("acc")).toBe("reauth_required");
  });

  it("does not mark reauth on a transient refresh failure", async () => {
    const { store, statuses } = setup();
    await store.saveTokens("acc", { accessToken: "a1", refreshToken: "r1", expiresAt: minutes(1) });
    await expect(store.getValidAccessToken("acc", async () => Promise.reject(new Error("ECONNRESET")))).rejects.toThrow(
      "ECONNRESET",
    );
    expect(statuses.has("acc")).toBe(false);
  });

  it("requires reauth when the token expired and there is no way to refresh", async () => {
    const { store, statuses } = setup();
    await store.saveTokens("acc", { accessToken: "a1", expiresAt: minutes(1) });
    await expect(store.getValidAccessToken("acc", vi.fn())).rejects.toBeInstanceOf(ReauthRequiredError);
    expect(statuses.get("acc")).toBe("reauth_required");
  });

  it("requires reauth when the refresh token itself expired", async () => {
    const { store } = setup();
    await store.saveTokens("acc", {
      accessToken: "a1",
      refreshToken: "r1",
      expiresAt: minutes(1),
      refreshExpiresAt: minutes(-10),
    });
    await expect(store.getValidAccessToken("acc", vi.fn())).rejects.toBeInstanceOf(ReauthRequiredError);
  });

  it("requires reauth when no tokens are stored", async () => {
    const { store, statuses } = setup();
    await expect(store.getValidAccessToken("missing")).rejects.toBeInstanceOf(ReauthRequiredError);
    expect(statuses.get("missing")).toBe("reauth_required");
  });
});
