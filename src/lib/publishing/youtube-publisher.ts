import { z } from "zod";
import { errorCode, HttpError, parseJson } from "@/lib/platforms/http";
import { toFailure } from "./errors";
import { youtubeOptionsSchema, type YouTubeOptions } from "./options";
import { PublishError, STATUS_CHECK_SECONDS, type PublishContext, type PublishJob, type PublishStep, type Publisher } from "./types";

/**
 * YouTube: resumable `videos.insert` (start a session, then PUT the bytes) with
 * the visibility and made-for-kids declaration the user chose. The upload
 * finishing does not mean the video is live: YouTube still processes it and
 * can reject it (copyright, duplicate...) or fail the conversion. So the
 * target waits and `videos.list` is asked for its status every few seconds;
 * it is published only once YouTube reports `processed`. Until the API project
 * passes YouTube's compliance audit Google may force uploads to private; the
 * step says so when that happens.
 */

const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
/** Posts scheduled before the visibility choice existed. */
const LEGACY_OPTIONS: YouTubeOptions = { privacy: "private", madeForKids: false };

export function youtubeOptions(raw: Record<string, unknown> | undefined): YouTubeOptions {
  const parsed = youtubeOptionsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : LEGACY_OPTIONS;
}

const videoSchema = z.object({ id: z.string(), status: z.object({ privacyStatus: z.string().optional() }).optional() });
const statusSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        status: z
          .object({
            uploadStatus: z.string().optional(),
            privacyStatus: z.string().optional(),
            failureReason: z.string().optional(),
            rejectionReason: z.string().optional(),
          })
          .optional(),
      }),
    )
    .default([]),
});

/** YouTube's failureReason / rejectionReason, in Spanish. */
const REASONS: Record<string, string> = {
  codec: "el códec del video no es compatible",
  conversion: "YouTube no pudo convertir el video",
  emptyFile: "el archivo está vacío",
  invalidFile: "el archivo no es un video válido",
  tooSmall: "el archivo es demasiado pequeño",
  uploadAborted: "la subida se interrumpió",
  claim: "tiene un reclamo de derechos",
  copyright: "infringe derechos de autor",
  duplicate: "es un duplicado de otro video del canal",
  inappropriate: "YouTube lo considera inapropiado",
  legal: "por motivos legales",
  length: "es demasiado largo para esta cuenta",
  termsOfUse: "incumple los Términos del servicio de YouTube",
  trademark: "infringe una marca registrada",
  uploaderAccountClosed: "la cuenta está cerrada",
  uploaderAccountSuspended: "la cuenta está suspendida",
};

const FORCED_PRIVATE = "YouTube lo dejó privado: la app aún no pasa la auditoría de la API de YouTube. Cámbialo a mano en YouTube Studio.";

/** One status check of an uploaded video; `null` while YouTube is still processing it. */
export function youtubeStatusStep(
  video: z.infer<typeof statusSchema>["items"][number] | undefined,
  videoId: string,
  wanted: YouTubeOptions["privacy"],
): PublishStep | null {
  if (!video) return { kind: "failed", error: "YouTube ya no encuentra el video (se borró o se rechazó).", retryable: false };
  const status = video.status ?? {};
  if (status.uploadStatus === "processed") {
    const step: PublishStep = { kind: "published", externalId: videoId, permalink: `https://www.youtube.com/watch?v=${videoId}` };
    return status.privacyStatus === "private" && wanted !== "private" ? { ...step, note: FORCED_PRIVATE } : step;
  }
  if (status.uploadStatus === "failed" || status.uploadStatus === "rejected" || status.uploadStatus === "deleted") {
    const code = status.rejectionReason ?? status.failureReason;
    const reason = code ? (REASONS[code] ?? code) : status.uploadStatus;
    const verb = status.uploadStatus === "rejected" ? "rechazó" : status.uploadStatus === "deleted" ? "borró" : "no pudo procesar";
    return { kind: "failed", error: `YouTube ${verb} el video: ${reason}.`, retryable: false };
  }
  return null; // "uploaded": still processing
}

async function fetchStatus(ctx: PublishContext, token: string, videoId: string) {
  const url = `${VIDEOS_URL}?part=status&id=${encodeURIComponent(videoId)}`;
  const response = await ctx.fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new HttpError(response.status, await errorCode(response));
  return parseJson(response, statusSchema, "youtube.videos.list");
}

/** Calls `fn` with a valid token, refreshing once when Google answers 401 to a token that had not expired. */
async function withToken<T>(job: PublishJob, ctx: PublishContext, fn: (token: string) => Promise<T>): Promise<T> {
  const token = await ctx.getAccessToken(job.accountId);
  try {
    return await fn(token);
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 401) throw error;
    return fn(await ctx.getAccessToken(job.accountId, { forceRefresh: true }));
  }
}

/** YouTube titles: up to 100 characters, no angle brackets, never empty. */
export function youtubeTitle(title: string | null, caption: string, fileName: string | null): string {
  const firstLine = caption.split("\n").find((line) => line.trim())?.trim();
  const raw = title?.trim() || firstLine || fileName?.replace(/\.[^.]+$/, "") || "Video";
  return raw.replace(/[<>]/g, "").slice(0, 100).trim() || "Video";
}

async function startSession(job: PublishJob, ctx: PublishContext, token: string, size: number): Promise<string> {
  const response = await ctx.fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(size),
      "X-Upload-Content-Type": job.video.mimeType || "video/*",
    },
    body: JSON.stringify({
      snippet: { title: youtubeTitle(job.title, job.caption, job.video.name), description: job.caption.replace(/[<>]/g, "").slice(0, 5000), categoryId: "22" },
      status: { privacyStatus: youtubeOptions(job.options).privacy, selfDeclaredMadeForKids: youtubeOptions(job.options).madeForKids },
    }),
  });
  if (!response.ok) throw new HttpError(response.status, await errorCode(response));
  const location = response.headers.get("location");
  if (!location) throw new PublishError("YouTube no abrió la sesión de subida.", true);
  return location;
}

export const youtubePublisher: Publisher = {
  async advance(job: PublishJob, ctx: PublishContext): Promise<PublishStep> {
    try {
      const wanted = youtubeOptions(job.options).privacy;
      const uploadedId = typeof job.state.videoId === "string" ? job.state.videoId : null;

      if (uploadedId) {
        // Already uploaded: only ask YouTube how the processing is going.
        const status = await withToken(job, ctx, (token) => fetchStatus(ctx, token, uploadedId));
        const step = youtubeStatusStep(status.items.find((item) => item.id === uploadedId), uploadedId, wanted);
        return step ?? { kind: "waiting", state: job.state, checkAfterSeconds: STATUS_CHECK_SECONDS };
      }

      const bytes = await ctx.downloadVideo();
      let token = await ctx.getAccessToken(job.accountId);
      let session: string;
      try {
        session = await startSession(job, ctx, token, bytes.byteLength);
      } catch (error) {
        // An unexpired token Google already revoked: refresh once and retry.
        if (!(error instanceof HttpError) || error.status !== 401) throw error;
        token = await ctx.getAccessToken(job.accountId, { forceRefresh: true });
        session = await startSession(job, ctx, token, bytes.byteLength);
      }

      const upload = await ctx.fetch(session, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": job.video.mimeType || "video/*", "Content-Length": String(bytes.byteLength) },
        body: bytes as unknown as BodyInit,
      });
      if (!upload.ok) throw new HttpError(upload.status, await errorCode(upload));
      const video = await parseJson(upload, videoSchema, "youtube.videos.insert");
      // Uploaded, not live yet: the next checks wait for YouTube to finish processing it.
      return { kind: "waiting", state: { videoId: video.id }, checkAfterSeconds: STATUS_CHECK_SECONDS };
    } catch (error) {
      return toFailure(error, "YouTube", (http) => {
        if (http.status === 403 && /insufficient|forbidden|PERMISSION/i.test(http.code)) {
          return { kind: "failed", error: "Falta el permiso de subir videos. Reconecta YouTube y acepta todos los permisos.", retryable: false };
        }
        if (/uploadLimitExceeded|quotaExceeded|rateLimitExceeded/.test(http.code)) {
          return { kind: "failed", error: `YouTube alcanzó su límite de subidas o cuota (${http.code}). Se reintentará más tarde.`, retryable: true };
        }
        return null;
      });
    }
  },
};
