import { exchangeToken, OAuthError } from "@/lib/mcp-oauth/core";
import { json, oauthErrorResponse, preflight } from "@/lib/mcp-oauth/http";
import { supabaseOAuthStore } from "@/lib/mcp-oauth/supabase-store";

// Token endpoint: authorization_code (with PKCE) and refresh_token (rotating).
export async function POST(request: Request) {
  try {
    const type = request.headers.get("content-type") ?? "";
    let form: URLSearchParams;
    if (type.includes("application/x-www-form-urlencoded")) form = new URLSearchParams(await request.text());
    else if (type.includes("application/json")) form = new URLSearchParams((await request.json().catch(() => ({}))) as Record<string, string>);
    else throw new OAuthError("invalid_request", "Send the body as application/x-www-form-urlencoded.");
    return json(await exchangeToken(supabaseOAuthStore(), form, new Date()));
  } catch (error) {
    return oauthErrorResponse(error);
  }
}

export const OPTIONS = preflight;
