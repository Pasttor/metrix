-- pg_net's functions always live in schema "net"; only the extension record
-- moves out of public (Supabase linter 0014).
drop extension if exists pg_net;
create extension pg_net with schema extensions;
