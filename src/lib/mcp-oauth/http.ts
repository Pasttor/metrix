import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { OAuthError } from "./core";

/** The public origin without a trailing slash (issuer and resource must match exactly). */
export function appUrl(): string {
  return getEnv().APP_URL.replace(/\/$/, "");
}

/** Metadata and token endpoints are read by browser-based MCP tools too. */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
};

export function json(body: unknown, status = 200): Response {
  return NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });
}

export function oauthErrorResponse(error: unknown): Response {
  if (error instanceof OAuthError) return json({ error: error.error, error_description: error.description }, error.status);
  console.warn(`[oauth] unexpected error: ${error instanceof Error ? error.name : "unknown"}`);
  return json({ error: "server_error", error_description: "Unexpected error." }, 500);
}

export const preflight = () => new Response(null, { status: 204, headers: CORS });
