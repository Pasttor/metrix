import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import type { Database } from "./types";

/**
 * Refreshes the Supabase session cookies for a request and returns the
 * verified email. `getResponse()` always returns the latest response, which
 * carries any cookie updates (refresh or sign-out).
 */
export async function updateSession(request: NextRequest) {
  const env = getEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims(): it refreshes
  // the session and validates the JWT signature.
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;

  return { supabase, email, getResponse: () => response };
}

/** Redirect that keeps the session cookies set on `from`. */
export function redirectWithCookies(request: NextRequest, to: string, from: NextResponse) {
  const redirect = NextResponse.redirect(new URL(to, request.url));
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
