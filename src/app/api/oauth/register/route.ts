import { registerClient } from "@/lib/mcp-oauth/core";
import { json, oauthErrorResponse, preflight } from "@/lib/mcp-oauth/http";
import { supabaseOAuthStore } from "@/lib/mcp-oauth/supabase-store";

// RFC 7591 dynamic client registration (public clients, Claude's redirects only).
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    return json(await registerClient(supabaseOAuthStore(), body, new Date()), 201);
  } catch (error) {
    return oauthErrorResponse(error);
  }
}

export const OPTIONS = preflight;
