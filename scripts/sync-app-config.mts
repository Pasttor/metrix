/**
 * Copies settings the database needs from env vars: the allowed email into
 * public.app_config (RLS) and CRON_SECRET into Vault (the pg_cron publish job
 * sends it as a bearer token). Neither ever lives in the repo.
 *
 * Usage: pnpm db:config   (reads .env.local)
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const allowedEmail = process.env.ALLOWED_EMAIL?.trim();
const cronSecret = process.env.CRON_SECRET?.trim();

async function main(): Promise<void> {
  if (!url || !serviceKey || !allowedEmail || !cronSecret) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_EMAIL or CRON_SECRET in .env.local",
    );
  }
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

  const response = await fetch(`${url}/rest/v1/app_config?on_conflict=key`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([
      { key: "allowed_email", value: allowedEmail, updated_at: new Date().toISOString() },
    ]),
  });
  if (!response.ok) {
    throw new Error(`app_config update failed: HTTP ${response.status}`);
  }
  console.log("app_config.allowed_email updated");

  const vault = await fetch(`${url}/rest/v1/rpc/set_cron_secret`, {
    method: "POST",
    headers,
    body: JSON.stringify({ p_secret: cronSecret }),
  });
  if (!vault.ok) {
    throw new Error(`cron secret update failed: HTTP ${vault.status}`);
  }
  console.log("vault.metrix_cron_secret updated");
}

// Set exitCode instead of calling process.exit() so Node closes cleanly on Windows.
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
