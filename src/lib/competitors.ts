import "server-only";
import { dateInTimeZone } from "@/lib/dates";
import { createAdminClient } from "@/lib/db/admin";
import { getEnv } from "@/lib/env";
import { createTokenStoreForServer } from "@/lib/oauth/deps";
import { ReauthRequiredError } from "@/lib/oauth/token-store";
import { createMetaClient } from "@/lib/platforms/meta/client";
import { competitorMetrics, competitorProfile, fetchCompetitor, igUsernameSchema, isUnavailableCompetitor } from "@/lib/platforms/meta/competitors";
import { supabaseMetricsStore } from "@/lib/sync/supabase-metrics-store";

/** Server-side management of the Instagram competitor list (service_role writes). */

export const MAX_COMPETITORS = 15;

export type CompetitorActionResult = { ok: boolean; message: string };

/**
 * Validates the username with business_discovery (it must be a business or
 * creator account), saves it and takes its first snapshot right away.
 */
export async function addInstagramCompetitor(input: string): Promise<CompetitorActionResult> {
  const parsed = igUsernameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Escribe un usuario de Instagram válido, por ejemplo @cuenta." };
  const username = parsed.data;

  const db = createAdminClient();
  const [{ data: ig, error: igError }, { count, error: countError }] = await Promise.all([
    db.from("accounts").select("id, external_id, handle").eq("platform", "instagram").limit(1).maybeSingle(),
    db.from("competitors").select("id", { count: "exact", head: true }).eq("platform", "instagram"),
  ]);
  if (igError || countError) return { ok: false, message: "No se pudo leer la base de datos. Vuelve a intentarlo." };
  if (!ig) return { ok: false, message: "Conecta tu cuenta de Instagram antes de agregar competidores." };
  if (ig.handle?.toLowerCase() === username) return { ok: false, message: "Esa es tu propia cuenta." };
  if ((count ?? 0) >= MAX_COMPETITORS) return { ok: false, message: `Puedes seguir hasta ${MAX_COMPETITORS} cuentas.` };

  let discovery;
  try {
    const token = await createTokenStoreForServer().getValidAccessToken(ig.id);
    discovery = await fetchCompetitor(createMetaClient({ version: getEnv().META_GRAPH_VERSION, accessToken: token }), ig.external_id, username);
  } catch (error) {
    if (error instanceof ReauthRequiredError) return { ok: false, message: "Reconecta Meta en Conexiones para agregar competidores." };
    if (isUnavailableCompetitor(error)) {
      return { ok: false, message: `Instagram no muestra @${username}: debe existir y ser cuenta de empresa o de creador.` };
    }
    console.warn(`[competitors] lookup failed: ${error instanceof Error ? error.name : "unknown"}`);
    return { ok: false, message: "No se pudo consultar Instagram. Vuelve a intentarlo." };
  }

  const { data: saved, error } = await db
    .from("competitors")
    .upsert({ platform: "instagram", username }, { onConflict: "platform,username" })
    .select("id")
    .single();
  if (error || !saved) return { ok: false, message: "No se pudo guardar el competidor." };

  const now = new Date();
  await supabaseMetricsStore(db).saveCompetitorSnapshot?.(
    saved.id,
    dateInTimeZone(now, getEnv().REPORT_TIMEZONE),
    competitorProfile(discovery),
    competitorMetrics(discovery, now),
  );
  return { ok: true, message: `@${username} agregado.` };
}

export async function removeCompetitor(id: string): Promise<CompetitorActionResult> {
  const { error } = await createAdminClient().from("competitors").delete().eq("id", id);
  return error ? { ok: false, message: "No se pudo quitar el competidor." } : { ok: true, message: "Competidor quitado." };
}
