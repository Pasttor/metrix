"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAuthorizedUser } from "@/lib/auth/session";
import { addInstagramCompetitor, removeCompetitor, type CompetitorActionResult } from "@/lib/competitors";

export async function addCompetitorAction(_previous: CompetitorActionResult | null, formData: FormData): Promise<CompetitorActionResult> {
  if (!(await isAuthorizedUser())) return { ok: false, message: "No autorizado." };
  const result = await addInstagramCompetitor(String(formData.get("username") ?? ""));
  if (result.ok) {
    revalidatePath("/settings/competitors");
    revalidatePath("/instagram");
  }
  return result;
}

export async function removeCompetitorAction(formData: FormData): Promise<void> {
  if (!(await isAuthorizedUser())) return;
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await removeCompetitor(id.data);
  revalidatePath("/settings/competitors");
  revalidatePath("/instagram");
}
