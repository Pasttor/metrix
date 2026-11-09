import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import type { OAuthStore } from "./core";

type Admin = ReturnType<typeof createAdminClient>;

function fail(operation: string, error: { code?: string }): never {
  throw new Error(`Database error in ${operation}${error.code ? ` (${error.code})` : ""}`);
}

export function supabaseOAuthStore(db: Admin = createAdminClient()): OAuthStore {
  return {
    async getClient(id) {
      const { data, error } = await db.from("mcp_clients").select("id, kind, name, redirect_uris").eq("id", id).maybeSingle();
      if (error) fail("mcp_clients.get", error);
      return data ? { id: data.id, kind: data.kind as "dcr" | "cimd", name: data.name, redirectUris: data.redirect_uris } : null;
    },

    async saveClient(client) {
      const { error } = await db
        .from("mcp_clients")
        .upsert({ id: client.id, kind: client.kind, name: client.name, redirect_uris: client.redirectUris }, { onConflict: "id" });
      if (error) fail("mcp_clients.save", error);
    },

    async saveCode(hash, code) {
      const { error } = await db.from("mcp_auth_codes").insert({
        code_hash: hash,
        client_id: code.clientId,
        redirect_uri: code.redirectUri,
        code_challenge: code.codeChallenge,
        scope: code.scope,
        expires_at: code.expiresAt.toISOString(),
      });
      if (error) fail("mcp_auth_codes.save", error);
    },

    async consumeCode(hash) {
      // The `used_at is null` filter makes the update the one-time check.
      const { data, error } = await db
        .from("mcp_auth_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("code_hash", hash)
        .is("used_at", null)
        .select("client_id, redirect_uri, code_challenge, scope, expires_at")
        .maybeSingle();
      if (error) fail("mcp_auth_codes.consume", error);
      return data
        ? { clientId: data.client_id, redirectUri: data.redirect_uri, codeChallenge: data.code_challenge, scope: data.scope, expiresAt: new Date(data.expires_at) }
        : null;
    },

    async createGrant({ clientId, clientName, scope }) {
      const { data, error } = await db.from("mcp_grants").insert({ client_id: clientId, client_name: clientName, scope }).select("id").single();
      if (error) fail("mcp_grants.create", error);
      return data.id;
    },

    async saveToken(hash, token) {
      const { error } = await db.from("mcp_tokens").insert({ token_hash: hash, kind: token.kind, grant_id: token.grantId, expires_at: token.expiresAt.toISOString() });
      if (error) fail("mcp_tokens.save", error);
    },

    async findToken(hash) {
      const { data, error } = await db
        .from("mcp_tokens")
        .select("kind, grant_id, expires_at, revoked_at, mcp_grants!inner(client_id, scope, revoked_at)")
        .eq("token_hash", hash)
        .maybeSingle();
      if (error) fail("mcp_tokens.find", error);
      if (!data) return null;
      const grant = Array.isArray(data.mcp_grants) ? data.mcp_grants[0] : data.mcp_grants;
      return {
        kind: data.kind as "access" | "refresh",
        grantId: data.grant_id,
        expiresAt: new Date(data.expires_at),
        revoked: data.revoked_at !== null,
        grantRevoked: grant?.revoked_at != null,
        clientId: grant?.client_id ?? "",
        scope: grant?.scope ?? "",
      };
    },

    async revokeToken(hash) {
      const { error } = await db.from("mcp_tokens").update({ revoked_at: new Date().toISOString() }).eq("token_hash", hash);
      if (error) fail("mcp_tokens.revoke", error);
    },

    async revokeGrant(grantId) {
      const now = new Date().toISOString();
      const grant = await db.from("mcp_grants").update({ revoked_at: now }).eq("id", grantId);
      if (grant.error) fail("mcp_grants.revoke", grant.error);
      const tokens = await db.from("mcp_tokens").update({ revoked_at: now }).eq("grant_id", grantId).is("revoked_at", null);
      if (tokens.error) fail("mcp_tokens.revoke_grant", tokens.error);
    },

    async touchGrant(grantId, at) {
      await db.from("mcp_grants").update({ last_used_at: at.toISOString() }).eq("id", grantId);
    },
  };
}
