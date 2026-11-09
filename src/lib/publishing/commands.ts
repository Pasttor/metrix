import "server-only";
import type { createAdminClient } from "@/lib/db/admin";
import { postStatus, type TargetStatus } from "./runner";
import type { ScheduleRows } from "./scheduling";

/**
 * Writes behind /publicar and the MCP tools, always with the service client
 * after the caller checked who is asking (session or MCP token).
 */

type Admin = ReturnType<typeof createAdminClient>;

export async function saveSchedule(db: Admin, rows: ScheduleRows): Promise<{ ok: true; postId: string } | { ok: false; message: string }> {
  const post = await db.from("scheduled_posts").insert(rows.post).select("id").single();
  if (post.error) return { ok: false, message: "No se pudo guardar la publicación." };
  const targets = await db.from("scheduled_post_targets").insert(rows.targets.map((target) => ({ ...target, scheduled_post_id: post.data.id })));
  if (targets.error) {
    await db.from("scheduled_posts").delete().eq("id", post.data.id);
    return { ok: false, message: "No se pudo guardar la publicación." };
  }
  return { ok: true, postId: post.data.id };
}

/** Cancels the networks that have not started; one already processing the video cannot be stopped. */
export async function cancelPost(db: Admin, postId: string): Promise<{ canceled: number }> {
  const now = new Date().toISOString();
  const canceled = await db
    .from("scheduled_post_targets")
    .update({ status: "canceled", updated_at: now })
    .eq("scheduled_post_id", postId)
    .eq("status", "pending")
    .select("id");
  const { data } = await db.from("scheduled_post_targets").select("status").eq("scheduled_post_id", postId);
  if (data && data.length > 0) {
    await db
      .from("scheduled_posts")
      .update({ status: postStatus(data.map((row) => row.status as TargetStatus)), updated_at: now })
      .eq("id", postId);
  }
  return { canceled: canceled.data?.length ?? 0 };
}

/** Sends a failed network back to the queue from scratch. */
export async function retryTarget(db: Admin, targetId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data } = await db
    .from("scheduled_post_targets")
    .update({ status: "pending", attempts: 0, state: {}, error: null, next_check_at: null, locked_until: null, updated_at: now })
    .eq("id", targetId)
    .eq("status", "failed")
    .select("scheduled_post_id")
    .maybeSingle();
  if (!data) return false;
  await db.from("scheduled_posts").update({ status: "publishing", updated_at: now }).eq("id", data.scheduled_post_id);
  return true;
}
