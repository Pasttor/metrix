"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAuthorizedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { getEnv } from "@/lib/env";
import { listPublishAccounts } from "@/lib/metrics/publishing-data";
import { ReauthRequiredError } from "@/lib/oauth/token-store";
import { HttpError } from "@/lib/platforms/http";
import { cancelPost, retryTarget, saveSchedule } from "@/lib/publishing/commands";
import { publishDeps, publishTokenGetter } from "@/lib/publishing/deps";
import { getDriveVideo } from "@/lib/publishing/drive";
import type { TikTokCreator } from "@/lib/publishing/options";
import { buildSchedule, readScheduleForm } from "@/lib/publishing/scheduling";
import { runPublish } from "@/lib/publishing/runner";
import { CREATOR_MESSAGES, fetchCreatorInfo } from "@/lib/publishing/tiktok-publisher";

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
  return { ok: true, message: soon ? "Listo: ya se está publicando. Sigue el estado de cada red abajo." : "Listo: quedó programada." };
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

export type CreatorInfoResult = { ok: true; creator: TikTokCreator } | { ok: false; message: string };

/** TikTok's latest creator info for the form: who posts, allowed privacy levels and interaction settings. */
export async function tiktokCreatorAction(accountId: string): Promise<CreatorInfoResult> {
  if (!(await isAuthorizedUser())) return { ok: false, message: "No autorizado." };
  const account = (await listPublishAccounts()).find((item) => item.id === accountId && item.platform === "tiktok");
  if (!account) return { ok: false, message: "La cuenta de TikTok ya no está conectada." };
  try {
    const token = await publishTokenGetter(createAdminClient())(account.id);
    return { ok: true, creator: await fetchCreatorInfo(fetch, token) };
  } catch (error) {
    if (error instanceof ReauthRequiredError) return { ok: false, message: "La conexión de TikTok expiró. Reconéctala en Configuración → Conexiones." };
    if (error instanceof HttpError && CREATOR_MESSAGES[error.code]) return { ok: false, message: CREATOR_MESSAGES[error.code] };
    return { ok: false, message: "No se pudo consultar a TikTok. Intenta de nuevo en un momento." };
  }
}

/** Duration of a picked Drive video (null while Google is still processing it). */
export async function driveVideoDurationAction(fileId: string): Promise<number | null> {
  if (!(await isAuthorizedUser())) return null;
  if (!/^[\w-]{10,200}$/.test(fileId)) return null;
  try {
    const db = createAdminClient();
    const { data } = await db.from("accounts").select("id").eq("platform", "drive").eq("status", "active").order("connected_at").limit(1);
    const accountId = data?.[0]?.id;
    if (!accountId) return null;
    const video = await getDriveVideo(fileId, await publishTokenGetter(db)(accountId));
    return video?.durationSeconds ?? null;
  } catch {
    return null;
  }
}

/** Server Actions share the page's maxDuration (300 s); stop claiming new targets well before it. */
const ADVANCE_BUDGET_MS = 240_000;

export type AdvanceResult = { ok: boolean; claimed: number };

/**
 * Advances the publish queue right now (uploads what is due, asks each
 * network for the status of what is processing). /publicar calls it every few
 * seconds while a post is in flight, so statuses change as soon as the network
 * finishes instead of waiting for the next cron run. The leases in
 * claim_publish_targets keep it from colliding with the cron.
 */
export async function advancePublishingAction(): Promise<AdvanceResult> {
  if (!(await isAuthorizedUser())) return { ok: false, claimed: 0 };
  const result = await runPublish(publishDeps(new Date(Date.now() + ADVANCE_BUDGET_MS)));
  if (result.claimed > 0) revalidatePath("/publicar");
  return { ok: true, claimed: result.claimed };
}
