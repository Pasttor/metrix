import "server-only";
import type { AdminClient } from "@/lib/db/admin";
import type { ConnectedAccount } from "./connector";
import type { OAuthStateStore } from "./state";
import type { TokenRepo, TokenStore } from "./token-store";
import type { ConnectPlatform } from "./types";

/** Supabase-backed stores (service_role). Errors carry no row data. */

function fail(operation: string, error: { code?: string } | null): never {
  throw new Error(`Database error in ${operation}${error?.code ? ` (${error.code})` : ""}`);
}

export function supabaseStateStore(db: AdminClient): OAuthStateStore {
  return {
    async insert(row) {
      const { error } = await db.from("oauth_states").insert(row);
      if (error) fail("oauth_states.insert", error);
    },
    async take(state) {
      const { data, error } = await db.from("oauth_states").delete().eq("state", state).select().maybeSingle();
      if (error) fail("oauth_states.take", error);
      return data ? { ...data, platform: data.platform as ConnectPlatform, code_verifier: data.code_verifier ?? "" } : null;
    },
    async purge(before) {
      const { error } = await db.from("oauth_states").delete().lt("created_at", before.toISOString());
      if (error) fail("oauth_states.purge", error);
    },
  };
}

export function supabaseTokenRepo(db: AdminClient): TokenRepo {
  return {
    async upsert(row) {
      const { error } = await db.from("oauth_tokens").upsert(row, { onConflict: "account_id" });
      if (error) fail("oauth_tokens.upsert", error);
    },
    async get(accountId) {
      const { data, error } = await db.from("oauth_tokens").select("*").eq("account_id", accountId).maybeSingle();
      if (error) fail("oauth_tokens.get", error);
      return data;
    },
    async setAccountStatus(accountId, status) {
      const { error } = await db.from("accounts").update({ status }).eq("id", accountId);
      if (error) fail("accounts.setStatus", error);
    },
  };
}

/** Upserts accounts (parents first, so Instagram can point at its Page) and their tokens. */
export function supabaseSaveConnection(db: AdminClient, tokens: TokenStore) {
  return async (accounts: ConnectedAccount[]) => {
    const ordered = [...accounts].sort((a, b) => Number(Boolean(a.parentExternalId)) - Number(Boolean(b.parentExternalId)));
    const ids = new Map<string, string>();

    for (const account of ordered) {
      const parentId = account.parentExternalId ? ids.get(account.parentExternalId) ?? null : null;
      const { data, error } = await db
        .from("accounts")
        .upsert(
          {
            platform: account.platform,
            external_id: account.externalId,
            name: account.name,
            handle: account.handle ?? null,
            avatar_url: account.avatarUrl ?? null,
            parent_account_id: parentId,
            status: "active",
          },
          { onConflict: "platform,external_id" },
        )
        .select("id")
        .single();
      if (error || !data) fail("accounts.upsert", error);

      ids.set(account.externalId, data.id);
      await tokens.saveTokens(data.id, account.tokens);
    }
  };
}
