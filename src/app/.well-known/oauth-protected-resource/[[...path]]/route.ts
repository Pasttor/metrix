import { protectedResourceMetadata } from "@/lib/mcp-oauth/core";
import { appUrl, json, preflight } from "@/lib/mcp-oauth/http";

// RFC 9728, served at /.well-known/oauth-protected-resource and
// /.well-known/oauth-protected-resource/api/mcp (Claude tries both).
export function GET() {
  return json(protectedResourceMetadata(appUrl()));
}

export const OPTIONS = preflight;
