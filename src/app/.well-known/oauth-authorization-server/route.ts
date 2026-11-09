import { authorizationServerMetadata } from "@/lib/mcp-oauth/core";
import { appUrl, json, preflight } from "@/lib/mcp-oauth/http";

// RFC 8414: how Claude finds the authorize, token and registration endpoints.
export function GET() {
  return json(authorizationServerMetadata(appUrl()));
}

export const OPTIONS = preflight;
