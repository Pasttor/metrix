-- Google Drive is its own connection (publishing source), apart from YouTube:
-- Google rejects drive.file in the same consent as the YouTube scopes.
alter table public.accounts drop constraint accounts_platform_check;
alter table public.accounts add constraint accounts_platform_check
  check (platform in ('youtube', 'instagram', 'facebook', 'tiktok', 'drive'));

alter table public.oauth_states drop constraint oauth_states_platform_check;
alter table public.oauth_states add constraint oauth_states_platform_check
  check (platform in ('youtube', 'instagram', 'facebook', 'tiktok', 'meta', 'drive'));
