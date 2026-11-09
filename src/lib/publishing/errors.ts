import { ReauthRequiredError, RefreshRejectedError } from "@/lib/oauth/token-store";
import { HttpError, ResponseShapeError } from "@/lib/platforms/http";
import { PublishError, type PublishStep } from "./types";

/**
 * Turns anything a publisher throws into a failed step with a message the
 * user can act on. Messages never include tokens, URLs or response bodies.
 */
export function toFailure(error: unknown, network: string, fromHttp: (error: HttpError) => PublishStep | null = () => null): PublishStep {
  if (error instanceof PublishError) return { kind: "failed", error: error.message, retryable: error.retryable };
  if (error instanceof ReauthRequiredError || error instanceof RefreshRejectedError) {
    return { kind: "failed", error: `La conexión de ${network} expiró. Reconéctala en Configuración → Conexiones.`, retryable: false };
  }
  if (error instanceof HttpError) {
    const mapped = fromHttp(error);
    if (mapped) return mapped;
    return {
      kind: "failed",
      error: `${network} respondió ${error.status}${error.code ? ` (${error.code})` : ""}.`,
      retryable: error.status >= 500 || error.status === 429,
    };
  }
  if (error instanceof ResponseShapeError) return { kind: "failed", error: `${network} respondió algo inesperado.`, retryable: true };
  if (error instanceof TypeError) return { kind: "failed", error: `No se pudo contactar a ${network}.`, retryable: true };
  return { kind: "failed", error: `Error inesperado al publicar en ${network}.`, retryable: true };
}
