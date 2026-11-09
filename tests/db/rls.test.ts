import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Runs the real migrations and seed in an in-process Postgres (PGlite) with a
 * minimal stub of what Supabase provides (roles and auth.jwt()), then checks
 * the RLS rules as each role would see them.
 */

const ALLOWED = "owner@example.com";
const supabaseDir = join(process.cwd(), "supabase");

// Minimal stand-in for the roles and auth helpers Supabase creates.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  grant usage on schema public to anon, authenticated, service_role;
  -- pg_cron is a Supabase extension PGlite lacks: the publish job migration only needs cron.schedule().
  create schema cron;
  create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$ select 1::bigint $$;
`;
// Extensions PGlite does not ship; SUPABASE_STUB covers what the migrations call.
const UNAVAILABLE_EXTENSIONS = /(drop extension if exists pg_net;)|create extension (if not exists )?(pg_cron|pg_net)( with schema extensions)?;/g;
// Like current Supabase projects, new tables get no automatic DML grants, so
// the migrations must grant every privilege explicitly.

let db: PGlite;
let accountId: string;

type Role = "anon" | "authenticated" | "service_role";

async function queryAs<T>(role: Role, email: string | null, sql: string): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(email ? { email, role } : { role }),
    ]);
    await tx.exec(`set local role ${role}`);
    const result = await tx.query<T>(sql);
    return result.rows;
  });
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);

  const migrations = readdirSync(join(supabaseDir, "migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of migrations) {
    await db.exec(readFileSync(join(supabaseDir, "migrations", file), "utf8").replace(UNAVAILABLE_EXTENSIONS, ""));
  }
  await db.exec(readFileSync(join(supabaseDir, "seed.sql"), "utf8"));

  await db.query("insert into public.app_config (key, value) values ('allowed_email', $1)", [
    ALLOWED,
  ]);
  const inserted = await db.query<{ id: string }>(
    "insert into public.accounts (platform, external_id, name) values ('youtube', 'UC123', 'Canal') returning id",
  );
  accountId = inserted.rows[0].id;
  await db.query(
    "insert into public.oauth_tokens (account_id, access_token_enc) values ($1, 'iv:tag:cipher')",
    [accountId],
  );
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("seed", () => {
  it("loads the metric catalog for the four platforms", async () => {
    const rows = await db.query<{ platform: string }>(
      "select distinct platform from public.metric_catalog order by platform",
    );
    expect(rows.rows.map((row) => row.platform)).toEqual([
      "facebook",
      "instagram",
      "tiktok",
      "youtube",
    ]);
  });

  it("is idempotent", async () => {
    const before = await db.query<{ n: number }>("select count(*)::int as n from public.metric_catalog");
    await db.exec(readFileSync(join(supabaseDir, "seed.sql"), "utf8"));
    const after = await db.query<{ n: number }>("select count(*)::int as n from public.metric_catalog");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});

describe("row level security", () => {
  it("lets the allowed user read accounts", async () => {
    const rows = await queryAs("authenticated", ALLOWED, "select id from public.accounts");
    expect(rows).toHaveLength(1);
  });

  it("matches the allowed email case-insensitively", async () => {
    const rows = await queryAs("authenticated", "Owner@Example.com", "select id from public.accounts");
    expect(rows).toHaveLength(1);
  });

  it("hides accounts from a user with another email", async () => {
    const rows = await queryAs("authenticated", "intruder@example.com", "select id from public.accounts");
    expect(rows).toHaveLength(0);
  });

  it("hides accounts from an authenticated user without email", async () => {
    const rows = await queryAs("authenticated", null, "select id from public.accounts");
    expect(rows).toHaveLength(0);
  });

  it("denies anon any access", async () => {
    await expect(queryAs("anon", null, "select id from public.accounts")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("keeps tokens, OAuth states and config server-only, even for the allowed user", async () => {
    for (const table of ["oauth_tokens", "oauth_states", "app_config"]) {
      await expect(
        queryAs("authenticated", ALLOWED, `select * from public.${table}`),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("does not let the allowed user write", async () => {
    await expect(
      queryAs(
        "authenticated",
        ALLOWED,
        "insert into public.accounts (platform, external_id) values ('tiktok', 'x')",
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("lets service_role read and write every table", async () => {
    const tables = await db.query<{ relname: string }>(`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname
    `);
    for (const { relname } of tables.rows) {
      const [privileges] = await queryAs<{ ok: boolean }>(
        "service_role",
        null,
        `select has_table_privilege('public.${relname}', 'select, insert, update, delete') as ok`,
      );
      expect(privileges.ok, `service_role on ${relname}`).toBe(true);
    }

    const rows = await queryAs<{ value: string }>(
      "service_role",
      null,
      "update public.app_config set value = value where key = 'allowed_email' returning value",
    );
    expect(rows).toHaveLength(1);
  });

  it("has RLS enabled on every public table", async () => {
    const rows = await db.query<{ relname: string }>(`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    `);
    expect(rows.rows).toEqual([]);
  });

  it("keeps the publish queue functions server-only", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await expect(queryAs(role, ALLOWED, "select * from public.claim_publish_targets(1, 60)")).rejects.toThrow(/permission denied/);
      await expect(queryAs(role, ALLOWED, "select public.set_cron_secret('a-long-enough-secret')")).rejects.toThrow(/permission denied/);
    }
    await expect(queryAs("service_role", null, "select * from public.claim_publish_targets(1, 60)")).resolves.toEqual([]);
  });
});
