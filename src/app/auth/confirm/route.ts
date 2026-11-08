import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/access";
import { createClient } from "@/lib/db/server";

/**
 * Magic link landing. Supports the default PKCE link (`?code=`) and the
 * token-hash email template (`?token_hash=&type=`). The proxy then checks the
 * email on the next request.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let failure: string | null = "missing_params";

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failure = error ? (error.code ?? error.name) : null;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    failure = error ? (error.code ?? error.name) : null;
  }

  if (failure) {
    // Error code only; never the code or token itself.
    console.warn(`[auth/confirm] magic link failed: ${failure}`);
    return NextResponse.redirect(new URL("/login?error=link", request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
