import { NextResponse, type NextRequest } from "next/server";
import { authCodeRedirect, decideAccess } from "@/lib/auth/access";
import { redirectWithCookies, updateSession } from "@/lib/db/proxy";
import { getEnv } from "@/lib/env";

export async function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;

  const codeRedirect = authCodeRedirect(pathname, searchParams);
  if (codeRedirect) {
    return NextResponse.redirect(new URL(codeRedirect, request.url));
  }

  const { supabase, email, getResponse } = await updateSession(request);

  const decision = decideAccess({
    pathname,
    search,
    email,
    allowedEmail: getEnv().ALLOWED_EMAIL,
  });

  switch (decision.action) {
    case "next":
      return getResponse();
    case "redirect":
      return redirectWithCookies(request, decision.to, getResponse());
    case "unauthorized":
      // Close the session (clears the auth cookies on the response) and explain why.
      await supabase.auth.signOut();
      return redirectWithCookies(request, "/login?error=unauthorized", getResponse());
  }
}

export const config = {
  matcher: [
    // Everything except Next internals and static files (images, and .txt site-verification files).
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};
