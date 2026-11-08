import "server-only";
import { isAuthorizedUser } from "@/lib/auth/session";
import { ReauthRequiredError } from "@/lib/oauth/token-store";
import { HttpError } from "@/lib/platforms/http";
import { getConnector } from "@/lib/platforms/registry";
import type { RetentionPoint } from "@/lib/platforms/youtube/parsers";
import { getRetentionCurve } from "@/lib/platforms/youtube/retention";
import { youtubeRetentionDeps } from "@/lib/platforms/youtube/deps";

export type RetentionResult = { status: "ok"; points: RetentionPoint[] } | { status: "unavailable"; message: string };

/**
 * Retention curve for the video detail. Served from the cache in posts.raw; on
 * a miss (or after 7 days) it is requested once from YouTube Analytics and cached.
 */
export async function loadRetention(postId: string): Promise<RetentionResult> {
  if (!(await isAuthorizedUser())) return { status: "unavailable", message: "No autorizado." };
  const connector = getConnector("youtube");
  if (!connector) return { status: "unavailable", message: "Faltan las credenciales de Google." };

  try {
    const points = await getRetentionCurve(postId, youtubeRetentionDeps(connector));
    return points ? { status: "ok", points } : { status: "unavailable", message: "No se encontró el video." };
  } catch (error) {
    if (error instanceof ReauthRequiredError) {
      return { status: "unavailable", message: "Reconecta YouTube en Configuración para ver la retención." };
    }
    // HttpError messages carry only the status and the provider's error code (no URL, no token).
    const reason = error instanceof HttpError ? error.message : error instanceof Error ? error.name : "unknown";
    console.warn(`[youtube:retention] failed: ${reason}`);
    return { status: "unavailable", message: `No se pudo obtener la curva de retención (${reason}).` };
  }
}
