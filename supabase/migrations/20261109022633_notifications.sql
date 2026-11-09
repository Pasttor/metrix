-- In-app alerts and events (sync failures, accounts to reconnect, expiring
-- tokens, story insights received...). Written by the server only.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  severity text not null check (severity in ('info', 'warning', 'error')),
  title text not null,
  message text not null,
  href text,
  -- One notification per key: e.g. "account:<id>:<date>" keeps it to one per account per day.
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_created_at_idx on public.notifications (created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;
create policy "allowed user can read" on public.notifications
  for select to authenticated using ((select private.is_allowed_user()));
