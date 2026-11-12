-- Every minute instead of every 5: a post scheduled for 10:00 starts by 10:01
-- and a network that finished processing shows Publicado within a minute even
-- with /publicar closed (while it is open the page advances the queue itself).
-- Also moves the call to the custom domain. cron.schedule with an existing
-- job name replaces that job.
select cron.schedule(
  'metrix-publish',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://metrix.website/api/cron/publish',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'metrix_cron_secret'), '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 290000
  );
  $job$
);
