"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAuthorizedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";

/** Users only read notifications (RLS); marking them as read goes through service_role after the session check. */

export async function markNotificationRead(formData: FormData): Promise<void> {
  if (!(await isAuthorizedUser())) return;
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await createAdminClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id.data).is("read_at", null);
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead(): Promise<void> {
  if (!(await isAuthorizedUser())) return;
  await createAdminClient().from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  revalidatePath("/", "layout");
}
