"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAuthorizedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { getEnv } from "@/lib/env";
import { listPublishAccounts } from "@/lib/metrics/publishing-data";
import { cancelPost, retryTarget, saveSchedule } from "@/lib/publishing/commands";
import { buildSchedule, readScheduleForm } from "@/lib/publishing/scheduling";

/** The user only reads scheduled posts (RLS); writes go through service_role after the session check. */

export type ScheduleActionResult = { ok: boolean; message: string };

export async function schedulePostAction(_previous: ScheduleActionResult | null, formData: FormData): Promise<ScheduleActionResult> {
  if (!(await isAuthorizedUser())) return { ok: false, message: "No autorizado." };
  const now = new Date();
  const result = buildSchedule(readScheduleForm(formData), await listPublishAccounts(), now, getEnv().REPORT_TIMEZONE);
  if (!result.ok) return result;

  const saved = await saveSchedule(createAdminClient(), result.rows);
  if (!saved.ok) return saved;

  revalidatePath("/publicar");
  const soon = Date.parse(result.rows.post.scheduled_at) <= now.getTime() + 60_000;
  return { ok: true, message: soon ? "Listo: se publicará en los próximos 5 minutos." : "Listo: quedó programada." };
}

const idSchema = z.uuid();

export async function cancelPostAction(formData: FormData): Promise<void> {
  if (!(await isAuthorizedUser())) return;
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  await cancelPost(createAdminClient(), id.data);
  revalidatePath("/publicar");
}

export async function retryTargetAction(formData: FormData): Promise<void> {
  if (!(await isAuthorizedUser())) return;
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  await retryTarget(createAdminClient(), id.data);
  revalidatePath("/publicar");
}
