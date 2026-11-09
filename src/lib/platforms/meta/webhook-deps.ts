import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { getEnv } from "@/lib/env";
import { insertNotifications } from "@/lib/notifications";
import { supabaseMetricsStore } from "@/lib/sync/supabase-metrics-store";
import type { WebhookDeps } from "./webhook-handler";

function fail(operation: string, error: { code?: string }): never {
  throw new Error(`Database error in ${operation}${error.code ? ` (${error.code})` : ""}`);
}

export function webhookDeps(): WebhookDeps {
  const env = getEnv();
  const db = createAdminClient();
  const metrics = supabaseMetricsStore(db);
  return {
    appSecret: env.META_APP_SECRET,
    verifyToken: env.META_WEBHOOK_VERIFY_TOKEN,
    reportTimeZone: env.REPORT_TIMEZONE,
    defer: (task) => after(task),
    notify: insertNotifications,
    async saveEvent(payload) {
      const { data, error } = await db.from("webhook_events").insert({ platform: "meta", payload }).select("id").single();
      if (error || !data) fail("webhook_events.insert", error ?? {});
      return data.id;
    },
    async finishEvent(id, eventError) {
      const { error } = await db.from("webhook_events").update({ processed_at: new Date().toISOString(), error: eventError }).eq("id", id);
      if (error) fail("webhook_events.finish", error);
    },
    store: {
      async findAccountId(igUserId) {
        const { data, error } = await db.from("accounts").select("id").eq("platform", "instagram").eq("external_id", igUserId).maybeSingle();
        if (error) fail("accounts.byExternalId", error);
        return data?.id ?? null;
      },
      async ensureStoryPost(accountId, mediaId, publishedAt) {
        const { data: existing, error } = await db.from("posts").select("id").eq("account_id", accountId).eq("external_id", mediaId).maybeSingle();
        if (error) fail("posts.byExternalId", error);
        if (existing) return existing.id;
        const ids = await metrics.upsertPosts(accountId, [
          { externalId: mediaId, type: "story", caption: null, permalink: null, thumbnailUrl: null, publishedAt, durationSeconds: null },
        ]);
        return ids.get(mediaId)!;
      },
      upsertPostMetrics: (capturedOn, rows) => metrics.upsertPostMetrics(capturedOn, rows),
    },
  };
}
