"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAuthorizedUser } from "@/lib/auth/session";
import { supabaseOAuthStore } from "@/lib/mcp-oauth/supabase-store";

/** Revokes a Claude connection: its access and refresh tokens stop working at once. */
export async function revokeGrantAction(formData: FormData): Promise<void> {
  if (!(await isAuthorizedUser())) return;
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await supabaseOAuthStore().revokeGrant(id.data);
  revalidatePath("/settings/claude");
}
