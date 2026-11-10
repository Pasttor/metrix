"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAuthorizedUser } from "@/lib/auth/session";
import { decrypt } from "@/lib/crypto";
import { createAdminClient } from "@/lib/db/admin";
import { getEnv } from "@/lib/env";
import { revokeAtProvider } from "@/lib/oauth/revoke";
import { ACCOUNT_PLATFORMS, connectPlatformFor, type AccountPlatform } from "@/lib/oauth/types";
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

export type DisconnectResult = { ok: boolean; message: string };

/**
 * Disconnects an account: revokes Metrix's access at the provider (best
 * effort) and deletes the account row, which cascades to its tokens, metrics
 * and posts. Scheduled posts keep their history with the account set to null.
 */
export async function disconnectAccount(accountId: string): Promise<DisconnectResult> {
  if (!(await isAuthorizedUser())) return { ok: false, message: "No autorizado." };
  if (!z.uuid().safeParse(accountId).success) return { ok: false, message: "Cuenta no válida." };

  const db = createAdminClient();
  const { data: account } = await db.from("accounts").select("id, platform").eq("id", accountId).maybeSingle();
  if (!account || !(ACCOUNT_PLATFORMS as readonly string[]).includes(account.platform)) return { ok: false, message: "No se encontró la cuenta." };
  const platform = account.platform as AccountPlatform;

  let revoked = false;
  const { data: token } = await db.from("oauth_tokens").select("access_token_enc, refresh_token_enc").eq("account_id", accountId).maybeSingle();
  if (token) {
    try {
      const env = getEnv();
      revoked = await revokeAtProvider(
        platform,
        { accessToken: decrypt(token.access_token_enc), refreshToken: token.refresh_token_enc ? decrypt(token.refresh_token_enc) : null },
        { tiktokClientKey: env.TIKTOK_CLIENT_KEY, tiktokClientSecret: env.TIKTOK_CLIENT_SECRET },
      );
    } catch {
      revoked = false; // The data is deleted anyway; the user can revoke from the provider.
    }
  }

  const { error } = await db.from("accounts").delete().eq("id", accountId);
  if (error) return { ok: false, message: "No se pudieron borrar los datos. Intenta de nuevo." };
  revalidatePath("/settings/connections");

  if (revoked) return { ok: true, message: "Listo: se quitó el acceso y se borraron todos sus datos." };
  const where = platform === "facebook" || platform === "instagram" ? "las integraciones comerciales de Facebook" : "la configuración de la red";
  return { ok: true, message: `Se borraron todos sus datos. Quita también el acceso de Metrix desde ${where}.` };
}
