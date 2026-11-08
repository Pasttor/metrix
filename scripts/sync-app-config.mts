/**
 * Copies settings that RLS needs from env vars into public.app_config, so
 * the allowed email never has to live in the repo.
 *
 * Usage: pnpm db:config   (reads .env.local)
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const allowedEmail = process.env.ALLOWED_EMAIL?.trim();

async function main(): Promise<void> {
  if (!url || !serviceKey || !allowedEmail) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or ALLOWED_EMAIL in .env.local",
    );
  }

  const response = await fetch(`${url}/rest/v1/app_config?on_conflict=key`, {
  method: "POST",
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  },
  body: JSON.stringify([
    { key: "allowed_email", value: allowedEmail, updated_at: new Date().toISOString() },
  ]),
  });

  if (!response.ok) {
    throw new Error(`app_config update failed: HTTP ${response.status}`);
  }

  console.log("app_config.allowed_email updated");
}

// Set exitCode instead of calling process.exit() so Node closes cleanly on Windows.
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
