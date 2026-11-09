-- Every 5 minutes: POST /api/cron/publish with the Vault secret. Without the
-- secret the app answers 401 and nothing is published.
select cron.schedule(
  'metrix-publish',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://metrix-swart-mu.vercel.app/api/cron/publish',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'metrix_cron_secret'), '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 290000
  );
  $job$
);
