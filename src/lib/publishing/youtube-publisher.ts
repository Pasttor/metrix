import { z } from "zod";
import { errorCode, HttpError, parseJson } from "@/lib/platforms/http";
import { toFailure } from "./errors";
import { PublishError, type PublishContext, type PublishJob, type PublishStep, type Publisher } from "./types";

/**
 * YouTube: resumable `videos.insert` in one run (start a session, then PUT the
 * bytes). Uploads stay **private** until Google audits the app: unaudited API
 * projects can only upload private videos.
 */

const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
export const YOUTUBE_PRIVACY = "private";

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
      status: { privacyStatus: YOUTUBE_PRIVACY, selfDeclaredMadeForKids: false },
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
      return {
        kind: "published",
        externalId: video.id,
        permalink: `https://www.youtube.com/watch?v=${video.id}`,
        note: "Subido como privado (YouTube lo exige hasta auditar la app).",
      };
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
