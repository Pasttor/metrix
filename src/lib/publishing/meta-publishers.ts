import { z } from "zod";
import { errorCode, HttpError, parseJson, type FetchFn } from "@/lib/platforms/http";
import { toFailure } from "./errors";
import { PublishError, STATUS_CHECK_SECONDS, type PublishContext, type PublishJob, type PublishStep, type Publisher } from "./types";

/**
 * Instagram Reels and Facebook Page Reels through the Graph API, uploading the
 * bytes directly (resumable "rupload" endpoints), so no public video URL is needed.
 */

const GRAPH = "https://graph.facebook.com";
const RUPLOAD = "https://rupload.facebook.com";

async function graph<T extends z.ZodType>(ctx: PublishContext, token: string, method: "GET" | "POST", path: string, params: Record<string, string>, schema: T): Promise<z.infer<T>> {
  const url = new URL(`${GRAPH}/${ctx.graphVersion}/${path}`);
  const init: RequestInit = { method, headers: { Authorization: `Bearer ${token}` } };
  if (method === "GET") for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  else init.body = new URLSearchParams(params);
  const response = await ctx.fetch(url.toString(), init);
  if (!response.ok) throw new HttpError(response.status, await errorCode(response));
  return parseJson(response, schema, `meta.publish.${path.split("/").pop()}`);
}

const ruploadErrorSchema = z.object({
  debug_info: z.object({ retriable: z.boolean().optional(), type: z.string().optional(), message: z.string().optional() }).optional(),
  error: z.unknown().optional(),
});

/**
 * Meta's upload host answers errors as `{ debug_info: { retriable, type, message } }`
 * instead of the Graph `{ error }` shape. Its message is about the upload
 * (never a token), so it is kept short and shown; `retriable` decides the retry.
 */
export async function ruploadFailure(response: Response, network: string): Promise<Error> {
  const text = await response.text().catch(() => "");
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const parsed = ruploadErrorSchema.safeParse(body);
  const info = parsed.success ? parsed.data.debug_info : undefined;
  if (info) {
    const detail = [info.type, info.message?.slice(0, 160)].filter(Boolean).join(": ");
    return new PublishError(`${network} no aceptó la subida del video (${response.status}${detail ? ` ${detail}` : ""}).`, info.retriable ?? response.status >= 500);
  }
  if (parsed.success && parsed.data.error) {
    // Graph-style error from the upload host: keep the usual permission/status handling.
    return new HttpError(response.status, await errorCode(new Response(text, { status: response.status })));
  }
  // Unknown body: a 5xx or an empty 400 from the upload host is usually transient.
  return new PublishError(`${network} no aceptó la subida del video (${response.status}).`, true);
}

/** Sends the whole file to a rupload URL (Meta accepts it in one request). */
async function rupload(fetchFn: FetchFn, url: string, token: string, bytes: Uint8Array, network: string): Promise<void> {
  const response = await fetchFn(url, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}`, offset: "0", file_size: String(bytes.byteLength), "Content-Type": "application/octet-stream" },
    body: bytes as unknown as BodyInit,
  });
  if (!response.ok) throw await ruploadFailure(response, network);
}

function describe(error: unknown, network: string): PublishStep {
  return toFailure(error, network, (http) =>
    /:(10|200|3|190)(:|$)/.test(http.code)
      ? { kind: "failed", error: `Meta rechazó la publicación por permisos (${http.code}). Reconecta Meta y acepta los permisos de publicar.`, retryable: false }
      : null,
  );
}

const createdSchema = z.object({ id: z.string(), uri: z.string().optional() });
const statusSchema = z.object({ status_code: z.string().optional(), status: z.string().optional() });
const publishedSchema = z.object({ id: z.string() });
const permalinkSchema = z.object({ permalink: z.string().optional() });

/** Instagram Reels: create a resumable container, upload, wait for FINISHED, publish. */
export const instagramPublisher: Publisher = {
  async advance(job: PublishJob, ctx: PublishContext): Promise<PublishStep> {
    try {
      const token = await ctx.getAccessToken(job.accountId);
      const containerId = typeof job.state.containerId === "string" ? job.state.containerId : null;

      if (!containerId) {
        const bytes = await ctx.downloadVideo();
        const container = await graph(ctx, token, "POST", `${job.externalAccountId}/media`, {
          media_type: "REELS",
          upload_type: "resumable",
          caption: job.caption.slice(0, 2200),
          share_to_feed: "true",
        }, createdSchema);
        await rupload(ctx.fetch, container.uri ?? `${RUPLOAD}/ig-api-upload/${ctx.graphVersion}/${container.id}`, token, bytes, "Instagram");
        return { kind: "waiting", state: { containerId: container.id }, checkAfterSeconds: STATUS_CHECK_SECONDS };
      }

      const status = await graph(ctx, token, "GET", containerId, { fields: "status_code,status" }, statusSchema);
      if (status.status_code === "IN_PROGRESS" || status.status_code === undefined) {
        return { kind: "waiting", state: job.state, checkAfterSeconds: STATUS_CHECK_SECONDS };
      }
      if (status.status_code !== "FINISHED") {
        throw new PublishError(`Instagram no pudo procesar el video (${status.status_code}${status.status ? `: ${status.status}` : ""}).`);
      }
      const media = await graph(ctx, token, "POST", `${job.externalAccountId}/media_publish`, { creation_id: containerId }, publishedSchema);
      const permalink = await graph(ctx, token, "GET", media.id, { fields: "permalink" }, permalinkSchema).catch(() => ({ permalink: undefined }));
      return { kind: "published", externalId: media.id, permalink: permalink.permalink ?? null };
    } catch (error) {
      return describe(error, "Instagram");
    }
  },
};

const reelStartSchema = z.object({ video_id: z.string(), upload_url: z.string().optional() });
const successSchema = z.object({ success: z.boolean().optional() });
const videoStatusSchema = z.object({
  status: z
    .object({
      video_status: z.string().optional(),
      processing_phase: z.object({ status: z.string().optional() }).optional(),
      publishing_phase: z.object({ status: z.string().optional() }).optional(),
    })
    .optional(),
  permalink_url: z.string().optional(),
});

/** Facebook Page Reels: start, upload, finish with PUBLISHED, then wait until it is live. */
export const facebookPublisher: Publisher = {
  async advance(job: PublishJob, ctx: PublishContext): Promise<PublishStep> {
    try {
      const token = await ctx.getAccessToken(job.accountId);
      const videoId = typeof job.state.videoId === "string" ? job.state.videoId : null;

      if (!videoId) {
        const bytes = await ctx.downloadVideo();
        const start = await graph(ctx, token, "POST", `${job.externalAccountId}/video_reels`, { upload_phase: "start" }, reelStartSchema);
        await rupload(ctx.fetch, start.upload_url ?? `${RUPLOAD}/video-upload/${ctx.graphVersion}/${start.video_id}`, token, bytes, "Facebook");
        await graph(ctx, token, "POST", `${job.externalAccountId}/video_reels`, {
          upload_phase: "finish",
          video_id: start.video_id,
          video_state: "PUBLISHED",
          description: job.caption.slice(0, 2200),
        }, successSchema);
        return { kind: "waiting", state: { videoId: start.video_id }, checkAfterSeconds: STATUS_CHECK_SECONDS };
      }

      const video = await graph(ctx, token, "GET", videoId, { fields: "status,permalink_url" }, videoStatusSchema);
      const phase = video.status?.publishing_phase?.status;
      const processing = video.status?.processing_phase?.status;
      if (video.status?.video_status === "error" || phase === "error" || processing === "error") {
        throw new PublishError("Facebook no pudo procesar el video.");
      }
      if (phase === "complete" || video.status?.video_status === "ready") {
        const link = video.permalink_url ? (video.permalink_url.startsWith("http") ? video.permalink_url : `https://www.facebook.com${video.permalink_url}`) : null;
        return { kind: "published", externalId: videoId, permalink: link };
      }
      return { kind: "waiting", state: job.state, checkAfterSeconds: STATUS_CHECK_SECONDS };
    } catch (error) {
      return describe(error, "Facebook");
    }
  },
};
