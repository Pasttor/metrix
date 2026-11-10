import { z } from "zod";
import { errorCode, HttpError, parseJson } from "@/lib/platforms/http";
import { toFailure } from "./errors";
import { youtubeOptionsSchema, type YouTubeOptions } from "./options";
import { PublishError, type PublishContext, type PublishJob, type PublishStep, type Publisher } from "./types";

/**
 * YouTube: resumable `videos.insert` in one run (start a session, then PUT the
 * bytes) with the visibility and made-for-kids declaration the user chose.
 * Until the API project passes YouTube's compliance audit, Google forces every
 * upload to private; the step says so when that happens.
 */

const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
/** Posts scheduled before the visibility choice existed. */
const LEGACY_OPTIONS: YouTubeOptions = { privacy: "private", madeForKids: false };

export function youtubeOptions(raw: Record<string, unknown> | undefined): YouTubeOptions {
  const parsed = youtubeOptionsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : LEGACY_OPTIONS;
}

const videoSchema = z.object({ id: z.string(), status: z.object({ privacyStatus: z.string().optional() }).optional() });

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
      const step: PublishStep = { kind: "published", externalId: video.id, permalink: `https://www.youtube.com/watch?v=${video.id}` };
      const wanted = youtubeOptions(job.options).privacy;
      const got = video.status?.privacyStatus;
      if (got === "private" && wanted !== "private") {
        return { ...step, note: "YouTube lo dejó privado: la app aún no pasa la auditoría de la API de YouTube. Cámbialo a mano en YouTube Studio." };
      }
      return step;
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
