import { z } from "zod";
import { errorCode, HttpError, ResponseShapeError, type FetchFn } from "@/lib/platforms/http";
import { TIKTOK_API } from "@/lib/platforms/tiktok/client";
import { toFailure } from "./errors";
import { PublishError, type PublishContext, type PublishJob, type PublishStep, type Publisher } from "./types";

/**
 * TikTok Content Posting API (Direct Post) with FILE_UPLOAD: ask the creator
 * info, init the post, PUT the chunks, then poll the status on later runs.
 * Unaudited apps can only post with privacy SELF_ONLY ("Solo yo").
 */

export const TIKTOK_PRIVACY = "SELF_ONLY";
const MIB = 1024 * 1024;
/** TikTok: files up to 64 MB go in one chunk; bigger ones in 5–64 MB chunks (the last absorbs the rest). */
const SINGLE_CHUNK_MAX = 64 * MIB;
const CHUNK_SIZE = 10 * MIB;

export function chunkPlan(size: number): { chunkSize: number; count: number } {
  if (size <= SINGLE_CHUNK_MAX) return { chunkSize: size, count: 1 };
  return { chunkSize: CHUNK_SIZE, count: Math.floor(size / CHUNK_SIZE) };
}

const errorSchema = z.object({ code: z.string(), message: z.string().optional() }).optional();
const creatorSchema = z.object({
  data: z.object({ privacy_level_options: z.array(z.string()).optional(), max_video_post_duration_sec: z.number().optional() }).optional(),
  error: errorSchema,
});
const initSchema = z.object({ data: z.object({ publish_id: z.string(), upload_url: z.string().optional() }).optional(), error: errorSchema });
const statusSchema = z.object({
  data: z
    .object({
      status: z.string().optional(),
      fail_reason: z.string().optional(),
      publicaly_available_post_id: z.array(z.union([z.string(), z.number()])).optional(),
    })
    .optional(),
  error: errorSchema,
});

async function post<T extends z.ZodType>(fetchFn: FetchFn, token: string, path: string, body: unknown, schema: T): Promise<z.infer<T>> {
  const response = await fetchFn(`${TIKTOK_API}/post/publish/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) throw new HttpError(response.status, await errorCode(response));
  const parsed = schema.safeParse(parseKeepingIds(await response.text()));
  if (!parsed.success) throw new ResponseShapeError(`tiktok.publish.${path}`);
  const error = (parsed.data as { error?: { code: string } }).error;
  if (error && error.code !== "ok") throw new HttpError(400, error.code);
  return parsed.data;
}

/** Post ids are 19-digit numbers that lose precision as JS numbers: read them as strings. */
export function parseKeepingIds(text: string): unknown {
  const quoted = text.replace(/("publicaly_available_post_id"\s*:\s*\[)([^\]]*)\]/g, (_match, open: string, inner: string) => `${open}${inner.replace(/(-?\d+)/g, '"$1"')}]`);
  try {
    return JSON.parse(quoted);
  } catch {
    return null;
  }
}

async function uploadChunks(fetchFn: FetchFn, url: string, bytes: Uint8Array, mimeType: string) {
  const { chunkSize, count } = chunkPlan(bytes.byteLength);
  for (let index = 0; index < count; index++) {
    const start = index * chunkSize;
    const end = index === count - 1 ? bytes.byteLength : start + chunkSize;
    const response = await fetchFn(url, {
      method: "PUT",
      headers: { "Content-Type": mimeType, "Content-Length": String(end - start), "Content-Range": `bytes ${start}-${end - 1}/${bytes.byteLength}` },
      body: bytes.subarray(start, end) as unknown as BodyInit,
    });
    if (!response.ok) throw new HttpError(response.status, await errorCode(response));
  }
}

const MESSAGES: Record<string, string> = {
  scope_not_authorized: "Falta el permiso de publicar. Reconecta TikTok y acepta todos los permisos.",
  unaudited_client_can_only_post_to_private_accounts: "TikTok solo deja publicar a cuentas privadas mientras la app no esté auditada. Pon tu cuenta en privado o espera la auditoría.",
  spam_risk_too_many_posts: "TikTok limitó las publicaciones de hoy. Intenta mañana.",
  spam_risk_user_banned_from_posting: "TikTok bloqueó las publicaciones de esta cuenta.",
  reached_active_user_cap: "La app alcanzó el límite diario de usuarios de TikTok. Se reintentará más tarde.",
  privacy_level_option_mismatch: "TikTok no acepta la privacidad «Solo yo» para esta cuenta.",
};

export const tiktokPublisher: Publisher = {
  async advance(job: PublishJob, ctx: PublishContext): Promise<PublishStep> {
    try {
      const token = await ctx.getAccessToken(job.accountId);
      const publishId = typeof job.state.publishId === "string" ? job.state.publishId : null;

      if (!publishId) {
        const creator = await post(ctx.fetch, token, "creator_info/query/", {}, creatorSchema);
        const options = creator.data?.privacy_level_options ?? [];
        if (options.length > 0 && !options.includes(TIKTOK_PRIVACY)) throw new PublishError(MESSAGES.privacy_level_option_mismatch);

        const bytes = await ctx.downloadVideo();
        const { chunkSize, count } = chunkPlan(bytes.byteLength);
        const init = await post(ctx.fetch, token, "video/init/", {
          post_info: { title: job.caption.slice(0, 2200), privacy_level: TIKTOK_PRIVACY, disable_comment: false, disable_duet: false, disable_stitch: false },
          source_info: { source: "FILE_UPLOAD", video_size: bytes.byteLength, chunk_size: chunkSize, total_chunk_count: count },
        }, initSchema);
        if (!init.data?.upload_url) throw new PublishError("TikTok no devolvió la dirección de subida.", true);
        await uploadChunks(ctx.fetch, init.data.upload_url, bytes, job.video.mimeType || "video/mp4");
        return { kind: "waiting", state: { publishId: init.data.publish_id }, checkAfterSeconds: 60 };
      }

      const status = await post(ctx.fetch, token, "status/fetch/", { publish_id: publishId }, statusSchema);
      const value = status.data?.status;
      if (value === "FAILED") throw new PublishError(`TikTok rechazó el video (${status.data?.fail_reason ?? "sin motivo"}).`);
      if (value === "PUBLISH_COMPLETE") {
        const postId = status.data?.publicaly_available_post_id?.[0];
        return { kind: "published", externalId: postId ? String(postId) : publishId, permalink: null, note: "Publicado como «Solo yo» hasta que TikTok audite la app." };
      }
      return { kind: "waiting", state: job.state, checkAfterSeconds: 120 };
    } catch (error) {
      return toFailure(error, "TikTok", (http) => {
        const message = MESSAGES[http.code];
        if (message) return { kind: "failed", error: message, retryable: http.code === "reached_active_user_cap" };
        if (http.code === "access_token_invalid") return { kind: "failed", error: "La conexión de TikTok expiró. Reconéctala.", retryable: false };
        return null;
      });
    }
  },
};
