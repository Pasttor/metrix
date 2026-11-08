import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";
import type { Database } from "./types";

let client: ReturnType<typeof createClient<Database>> | undefined;

/** service_role client: bypasses RLS. Server-only, for writes and token access. */
export function createAdminClient() {
  if (!client) {
    const env = getEnv();
    client = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}

export type AdminClient = ReturnType<typeof createAdminClient>;
