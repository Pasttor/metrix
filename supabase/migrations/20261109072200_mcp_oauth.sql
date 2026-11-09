-- OAuth 2.1 for the Metrix MCP server (Claude connects as a public client
-- with PKCE). Codes and tokens are stored as SHA-256 hashes only.

create table public.mcp_clients (
  id text primary key,                 -- random id (DCR) or the metadata URL (CIMD)
  kind text not null check (kind in ('dcr', 'cimd')),
  name text,
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);

-- One grant per approval: what the settings page lists and revokes.
create table public.mcp_grants (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.mcp_clients (id) on delete cascade,
  client_name text,
  scope text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table public.mcp_auth_codes (
  code_hash text primary key,
  client_id text not null references public.mcp_clients (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  scope text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.mcp_tokens (
  token_hash text primary key,
  kind text not null check (kind in ('access', 'refresh')),
  grant_id uuid not null references public.mcp_grants (id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index mcp_tokens_grant_id_idx on public.mcp_tokens (grant_id);
create index mcp_grants_client_id_idx on public.mcp_grants (client_id);
create index mcp_auth_codes_client_id_idx on public.mcp_auth_codes (client_id);

alter table public.mcp_clients enable row level security;
alter table public.mcp_grants enable row level security;
alter table public.mcp_auth_codes enable row level security;
alter table public.mcp_tokens enable row level security;

revoke all on public.mcp_clients, public.mcp_grants, public.mcp_auth_codes, public.mcp_tokens from anon, authenticated;
grant select, insert, update, delete on public.mcp_clients, public.mcp_grants, public.mcp_auth_codes, public.mcp_tokens to service_role;

-- The settings page lists connected clients with the user's session.
grant select on public.mcp_grants to authenticated;
create policy "allowed user can read" on public.mcp_grants
  for select to authenticated using ((select private.is_allowed_user()));
