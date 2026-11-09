-- The publish cron: pg_cron calls the app every 5 minutes through pg_net.
-- The bearer secret lives in Vault (name 'metrix_cron_secret'), set with
-- public.set_cron_secret() from `pnpm db:config`, never in SQL files.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.set_cron_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
begin
  if length(coalesce(p_secret, '')) < 16 then
    raise exception 'secret too short';
  end if;
  select id into existing from vault.secrets where name = 'metrix_cron_secret';
  if existing is null then
    perform vault.create_secret(p_secret, 'metrix_cron_secret', 'Bearer secret for /api/cron/* calls from pg_cron');
  else
    perform vault.update_secret(existing, p_secret);
  end if;
end;
$$;

revoke all on function public.set_cron_secret(text) from public, anon, authenticated;
grant execute on function public.set_cron_secret(text) to service_role;
