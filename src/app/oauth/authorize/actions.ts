"use server";

import { redirect } from "next/navigation";
import { isAuthorizedUser } from "@/lib/auth/session";
import { issueCode, readAuthorizeRequest, redirectWith, validateAuthorizeRequest } from "@/lib/mcp-oauth/core";
import { appUrl } from "@/lib/mcp-oauth/http";
import { supabaseOAuthStore } from "@/lib/mcp-oauth/supabase-store";

/** Approve or deny the request shown on the consent page. Everything is validated again here. */
export async function decideAuthorization(formData: FormData): Promise<void> {
  const params = new URLSearchParams();
  for (const key of ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"]) {
    const value = formData.get(key);
    if (typeof value === "string" && value) params.set(key, value);
  }
  const request = readAuthorizeRequest(params);
  const store = supabaseOAuthStore();
  const checked = await validateAuthorizeRequest(store, request, `${appUrl()}/api/mcp`);
  if (!checked.ok) {
    if (!checked.redirect) redirect("/oauth/authorize?error=invalid");
    redirect(redirectWith(request.redirectUri, { error: checked.error, error_description: checked.description, state: request.state, iss: appUrl() }));
  }

  if (!(await isAuthorizedUser()) || formData.get("decision") !== "allow") {
    redirect(redirectWith(request.redirectUri, { error: "access_denied", state: request.state, iss: appUrl() }));
  }

  const code = await issueCode(store, request, new Date());
  redirect(redirectWith(request.redirectUri, { code, state: request.state, iss: appUrl() }));
}
