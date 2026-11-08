"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAuthorizedUser } from "@/lib/auth/session";
import { connectPlatformFor } from "@/lib/oauth/types";
import { backfillDeps } from "@/lib/sync/deps";
import { runSync } from "@/lib/sync/runner";

export type SyncNowResult = { ok: boolean; message: string };

/** Server Actions on this page share its maxDuration (60 s). */
const SYNC_NOW_BUDGET_MS = 50_000;

export async function syncNow(accountId: string): Promise<SyncNowResult> {
  if (!(await isAuthorizedUser())) return { ok: false, message: "No autorizado." };
  if (!z.uuid().safeParse(accountId).success) return { ok: false, message: "Cuenta no válida." };

  const deps = backfillDeps();
  const platform = await deps.getAccountPlatform(accountId);
  if (!platform) return { ok: false, message: "No se encontró la cuenta." };

  const result = await runSync(
    {
      platform: connectPlatformFor(platform),
      job: "daily",
      accountId,
      deadline: new Date(Date.now() + SYNC_NOW_BUDGET_MS),
    },
    deps,
  );
  revalidatePath("/settings/connections");

  switch (result.status) {
    case "skipped":
      return { ok: false, message: "Esta red todavía no tiene sincronizador." };
    case "success":
      return { ok: true, message: `Sincronizada: ${result.stats.rowsWritten} filas guardadas.` };
    case "partial":
      return result.done
        ? { ok: false, message: "Sincronización con errores. Revisa el detalle en Salud." }
        : { ok: true, message: "Quedó a medias por tiempo; la siguiente corrida continúa desde ahí." };
    case "error":
      return { ok: false, message: result.stats.errors[0]?.message ?? "La sincronización falló." };
  }
}
