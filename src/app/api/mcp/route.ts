import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyAccessToken } from "@/lib/mcp-oauth/core";
import { appUrl } from "@/lib/mcp-oauth/http";
import { supabaseOAuthStore } from "@/lib/mcp-oauth/supabase-store";
import { MCP_INSTRUCTIONS, registerMetrixTools } from "@/lib/mcp/server";

// Remote MCP server (Streamable HTTP). Claude connects with OAuth: without a
// valid bearer token the answer is 401 + WWW-Authenticate pointing at the
// protected resource metadata, which starts the sign-in.
export const maxDuration = 60;

let cached: ((request: Request) => Promise<Response>) | null = null;

// Built on first use so importing the route never reads env vars (CI typegen).
function handler() {
  cached ??= withMcpAuth(
    createMcpHandler(registerMetrixTools, { serverInfo: { name: "metrix", version: "1.0.0" }, instructions: MCP_INSTRUCTIONS }),
    async (_request, bearerToken) => {
      const verified = await verifyAccessToken(supabaseOAuthStore(), bearerToken, new Date());
      return verified ? { token: verified.token, clientId: verified.clientId, scopes: verified.scopes, expiresAt: verified.expiresAt } : undefined;
    },
    { required: true, resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp", resourceUrl: appUrl() },
  );
  return cached;
}

export const GET = (request: Request) => handler()(request);
export const POST = (request: Request) => handler()(request);
export const DELETE = (request: Request) => handler()(request);
