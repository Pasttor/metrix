import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { publishDeps } from "@/lib/publishing/deps";
import { runPublish } from "@/lib/publishing/runner";
import { CRON_BUDGET_MS, isValidCronAuth } from "@/lib/sync/handlers";

// pg_cron (Supabase) calls this every 5 minutes with "Authorization: Bearer ${CRON_SECRET}".
export const maxDuration = 300;

async function handle(request: Request) {
  if (!isValidCronAuth(request.headers.get("authorization"), getEnv().CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runPublish(publishDeps(new Date(Date.now() + CRON_BUDGET_MS)));
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
