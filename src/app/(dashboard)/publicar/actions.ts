"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAuthorizedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { getEnv } from "@/lib/env";
import { listPublishAccounts } from "@/lib/metrics/publishing-data";
import { postStatus, type TargetStatus } from "@/lib/publishing/runner";
import { buildSchedule, readScheduleForm } from "@/lib/publishing/scheduling";

/** The user only reads scheduled posts (RLS); writes go through service_role after the session check. */

export type ScheduleActionResult = { ok: boolean; message: string };

export async function schedulePostAction(_previous: ScheduleActionResult | null, formData: FormData): Promise<ScheduleActionResult> {
  if (!(await isAuthorizedUser())) return { ok: false, message: "No autorizado." };
  const now = new Date();
  const result = buildSchedule(readScheduleForm(formData), await listPublishAccounts(), now, getEnv().REPORT_TIMEZONE);
  if (!result.ok) return result;

  const db = createAdminClient();
  const post = await db.from("scheduled_posts").insert(result.rows.post).select("id").single();
  if (post.error) return { ok: false, message: "No se pudo guardar la publicación." };
  const targets = await db.from("scheduled_post_targets").insert(result.rows.targets.map((target) => ({ ...target, scheduled_post_id: post.data.id })));
  if (targets.error) {
    await db.from("scheduled_posts").delete().eq("id", post.data.id);
    return { ok: false, message: "No se pudo guardar la publicación." };
  }

  revalidatePath("/publicar");
  const soon = Date.parse(result.rows.post.scheduled_at) <= now.getTime() + 60_000;
  return { ok: true, message: soon ? "Listo: se publicará en los próximos 5 minutos." : "Listo: quedó programada." };
}

const idSchema = z.uuid();

/** Cancels what has not started; a network already processing the video cannot be stopped. */
export async function cancelPostAction(formData: FormData): Promise<void> {
  if (!(await isAuthorizedUser())) return;
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  const db = createAdminClient();
  const now = new Date().toISOString();
  await db.from("scheduled_post_targets").update({ status: "canceled", updated_at: now }).eq("scheduled_post_id", id.data).eq("status", "pending");
  const { data } = await db.from("scheduled_post_targets").select("status").eq("scheduled_post_id", id.data);
  const status = postStatus((data ?? []).map((row) => row.status as TargetStatus));
  await db.from("scheduled_posts").update({ status, updated_at: now }).eq("id", id.data);
  revalidatePath("/publicar");
}

/** Sends a failed network back to the queue from scratch. */
export async function retryTargetAction(formData: FormData): Promise<void> {
  if (!(await isAuthorizedUser())) return;
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  const db = createAdminClient();
  const now = new Date().toISOString();
  const { data } = await db
    .from("scheduled_post_targets")
    .update({ status: "pending", attempts: 0, state: {}, error: null, next_check_at: null, locked_until: null, updated_at: now })
    .eq("id", id.data)
    .eq("status", "failed")
    .select("scheduled_post_id")
    .maybeSingle();
  if (data) await db.from("scheduled_posts").update({ status: "publishing", updated_at: now }).eq("id", data.scheduled_post_id);
  revalidatePath("/publicar");
}
