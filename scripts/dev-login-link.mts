/**
 * Local development only: prints a one-time login link for ALLOWED_EMAIL
 * without sending an email (Supabase's built-in mailer allows very few
 * emails per hour). The link uses token_hash, so it works in any browser.
 *
 * Usage: pnpm auth:link   (reads .env.local)
 *
 * The link is a short-lived credential: open it right away and do not share it.
 */
import { createClient } from "@supabase/supabase-js";

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.ALLOWED_EMAIL?.trim();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  if (!url || !serviceKey || !email) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or ALLOWED_EMAIL in .env.local");
  }

  const host = new URL(appUrl).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error("auth:link only works when APP_URL points to localhost");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
  if (error) {
    throw new Error(`Could not generate the link: ${error.code ?? error.message}`);
  }

  const link = new URL("/auth/confirm", appUrl);
  link.searchParams.set("token_hash", data.properties.hashed_token);
  link.searchParams.set("type", data.properties.verification_type);
  link.searchParams.set("next", "/");

  console.log("One-time login link (expires soon, do not share):");
  console.log(link.toString());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
