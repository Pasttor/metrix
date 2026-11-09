/**
 * Pure access rules used by the proxy. Kept free of Next/Supabase imports so
 * they can be unit-tested.
 */

/** Paths reachable without a session. API routes guard themselves (cron secret, webhook signature, session checks). */
/** Public routes: login flow, APIs (own auth) and the pages OAuth reviewers must reach. */
const PUBLIC_PREFIXES = ["/login", "/auth/", "/api/", "/acerca", "/privacidad"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isAllowedEmail(email: string | null | undefined, allowedEmail: string): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === allowedEmail.trim().toLowerCase();
}

/** Only same-site relative paths, to avoid open redirects. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

/**
 * If Supabase falls back to the Site URL (redirect URL not allow-listed), the
 * magic link lands on `/?code=...`. Send it to the callback so login still works.
 */
export function authCodeRedirect(pathname: string, searchParams: URLSearchParams): string | null {
  const code = searchParams.get("code");
  if (!code || pathname.startsWith("/auth/") || pathname.startsWith("/api/")) return null;
  const params = new URLSearchParams({ code, next: safeNextPath(searchParams.get("next") ?? pathname) });
  return `/auth/confirm?${params.toString()}`;
}

export type AccessDecision =
  | { action: "next" }
  | { action: "redirect"; to: string }
  | { action: "unauthorized" };

export function decideAccess(input: {
  pathname: string;
  search: string;
  email: string | null;
  allowedEmail: string;
}): AccessDecision {
  const { pathname, search, email, allowedEmail } = input;

  if (email && !isAllowedEmail(email, allowedEmail)) {
    // A session for any other email is closed, even on public pages.
    return isPublicPath(pathname) && pathname !== "/login" ? { action: "next" } : { action: "unauthorized" };
  }

  if (pathname === "/login" && email) {
    return { action: "redirect", to: "/" };
  }

  if (isPublicPath(pathname)) {
    return { action: "next" };
  }

  if (!email) {
    const next = `${pathname}${search}`;
    const to = next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
    return { action: "redirect", to };
  }

  return { action: "next" };
}
