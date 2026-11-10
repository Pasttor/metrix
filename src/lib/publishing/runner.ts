import type { NotificationRow } from "@/lib/alerts";
import { HttpError, type FetchFn } from "@/lib/platforms/http";
import { downloadDriveFile } from "./drive";
import { toFailure } from "./errors";
import { PublishError, type PublishContext, type PublishJob, type PublishPlatform, type PublishStep, type Publisher } from "./types";

/**
 * One publish cron run: lease the due targets, advance each network's state
 * machine one step, save the outcome and settle the parent posts.
 */

export const MAX_ATTEMPTS = 3;
export const LEASE_SECONDS = 290;
export const BATCH_LIMIT = 8;
/** Give up when a network keeps "processing" this long. */
export const MAX_WAIT_MS = 3 * 60 * 60 * 1000;

export type TargetStatus = "pending" | "processing" | "published" | "failed" | "canceled";
export type PostStatus = "scheduled" | "publishing" | "done" | "partial" | "failed" | "canceled";

export type ClaimedTarget = {
  id: string;
  postId: string;
  platform: PublishPlatform;
  accountId: string | null;
  externalAccountId: string | null;
  caption: string;
  title: string | null;
  options?: Record<string, unknown>;
  state: Record<string, unknown>;
  attempts: number;
  video: PublishJob["video"];
};

export type TargetUpdate = {
  status: TargetStatus;
  attempts: number;
  state: Record<string, unknown>;
  next_check_at: string | null;
  external_id?: string | null;
  permalink?: string | null;
  error: string | null;
  published_at?: string | null;
};

export interface PublishStore {
  claimDue(limit: number, leaseSeconds: number): Promise<ClaimedTarget[]>;
  saveTarget(targetId: string, update: TargetUpdate): Promise<void>;
  /** Recomputes the status of these posts from their targets. */
  settlePosts(postIds: string[]): Promise<void>;
}

export type PublishRunDeps = {
  store: PublishStore;
  publishers: Record<PublishPlatform, Publisher>;
  getAccessToken: PublishContext["getAccessToken"];
  /** Account whose Google token (drive.file) downloads the videos: the Google Drive connection. */
  getDriveAccountId: () => Promise<string | null>;
  notify: (rows: NotificationRow[]) => Promise<void>;
  fetch?: FetchFn;
  graphVersion: string;
  now?: () => Date;
  deadline: Date;
};

export type PublishRunResult = { claimed: number; published: number; waiting: number; retrying: number; failed: number; skipped: number };

const LABELS: Record<PublishPlatform, string> = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };

/** A post's status from its targets' statuses. */
export function postStatus(statuses: TargetStatus[]): PostStatus {
  const active = statuses.filter((status) => status !== "canceled");
  if (active.length === 0) return "canceled";
  if (active.some((status) => status === "pending" || status === "processing")) return "publishing";
  if (active.every((status) => status === "published")) return "done";
  if (active.some((status) => status === "published")) return "partial";
  return "failed";
}

/** Minutes to wait before retry number `attempts` (1-based). */
export function retryDelayMinutes(attempts: number): number {
  return 10 * attempts;
}

function snippet(caption: string): string {
  const line = caption.split("\n").find((value) => value.trim())?.trim() ?? "";
  return line.length > 80 ? `${line.slice(0, 79)}…` : line || "Video sin texto";
}

export function nextUpdate(target: ClaimedTarget, step: PublishStep, now: Date): TargetUpdate {
  if (step.kind === "published") {
    return {
      status: "published",
      attempts: target.attempts,
      state: step.note ? { note: step.note } : {},
      next_check_at: null,
      external_id: step.externalId,
      permalink: step.permalink,
      error: null,
      published_at: now.toISOString(),
    };
  }
  if (step.kind === "waiting") {
    const since = typeof target.state.waitingSince === "string" ? target.state.waitingSince : now.toISOString();
    if (now.getTime() - Date.parse(since) > MAX_WAIT_MS) {
      return nextUpdate(target, { kind: "failed", error: `${LABELS[target.platform]} tardó demasiado en procesar el video.`, retryable: false }, now);
    }
    return {
      status: "processing",
      attempts: target.attempts,
      state: { ...step.state, waitingSince: since },
      next_check_at: new Date(now.getTime() + step.checkAfterSeconds * 1000).toISOString(),
      error: null,
    };
  }
  const attempts = target.attempts + 1;
  if (step.retryable && attempts < MAX_ATTEMPTS) {
    return {
      status: target.state.waitingSince ? "processing" : "pending",
      attempts,
      state: target.state,
      next_check_at: new Date(now.getTime() + retryDelayMinutes(attempts) * 60_000).toISOString(),
      error: `${step.error} Reintento ${attempts} de ${MAX_ATTEMPTS - 1}.`,
    };
  }
  return { status: "failed", attempts, state: target.state, next_check_at: null, error: step.error };
}

function notificationFor(target: ClaimedTarget, update: TargetUpdate): NotificationRow | null {
  const label = LABELS[target.platform];
  if (update.status === "published") {
    return {
      kind: "publish_done",
      severity: "info",
      title: `Publicado en ${label}`,
      message: snippet(target.caption),
      href: update.permalink ?? "/publicar",
      dedupe_key: `publish:${target.id}:published`,
    };
  }
  if (update.status === "failed") {
    return {
      kind: "publish_failed",
      severity: "error",
      title: `No se pudo publicar en ${label}`,
      message: `${snippet(target.caption)} — ${update.error ?? "error desconocido"}`.slice(0, 500),
      href: "/publicar",
      dedupe_key: `publish:${target.id}:failed:${update.attempts}`,
    };
  }
  return null;
}

export async function runPublish(deps: PublishRunDeps): Promise<PublishRunResult> {
  const now = deps.now ?? (() => new Date());
  const fetchFn = deps.fetch ?? fetch;
  const result: PublishRunResult = { claimed: 0, published: 0, waiting: 0, retrying: 0, failed: 0, skipped: 0 };

  const targets = await deps.store.claimDue(BATCH_LIMIT, LEASE_SECONDS);
  result.claimed = targets.length;
  if (targets.length === 0) return result;

  const driveAccountId = await deps.getDriveAccountId();
  const notifications: NotificationRow[] = [];
  const touched = new Set<string>();
  // The video of the post being processed, downloaded at most once per run.
  let cached = null as { postId: string; get: () => Promise<Uint8Array> } | null;

  const download = async (target: ClaimedTarget): Promise<Uint8Array> => {
    if (!driveAccountId) throw new PublishError("Conecta Google Drive en Configuración → Conexiones para poder descargar los videos.");
    const get = async (forceRefresh: boolean) =>
      downloadDriveFile(target.video.driveFileId, await deps.getAccessToken(driveAccountId, { forceRefresh }), fetchFn);
    try {
      return await get(false);
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) return get(true);
      throw error;
    }
  };

  for (const target of targets) {
    touched.add(target.postId);
    if (now() >= deps.deadline) {
      // Out of time: the lease expires and the next run picks it up.
      result.skipped += 1;
      continue;
    }

    let step: PublishStep;
    if (!target.accountId || !target.externalAccountId) {
      step = { kind: "failed", error: `La cuenta de ${LABELS[target.platform]} ya no está conectada.`, retryable: false };
    } else {
      if (cached?.postId !== target.postId) {
        // Lazy: status checks of a video already uploaded never download it.
        let bytes: Promise<Uint8Array> | undefined;
        cached = { postId: target.postId, get: () => (bytes ??= download(target)) };
      }
      const job: PublishJob = {
        targetId: target.id,
        platform: target.platform,
        accountId: target.accountId,
        externalAccountId: target.externalAccountId,
        caption: target.caption,
        title: target.title,
        video: target.video,
        options: target.options ?? {},
        state: target.state,
        attempts: target.attempts,
      };
      const ctx: PublishContext = { getAccessToken: deps.getAccessToken, downloadVideo: cached.get, fetch: fetchFn, graphVersion: deps.graphVersion, now };
      try {
        step = await deps.publishers[target.platform].advance(job, ctx);
      } catch (error) {
        step = toFailure(error, LABELS[target.platform]);
      }
    }

    const update = nextUpdate(target, step, now());
    await deps.store.saveTarget(target.id, update);
    if (update.status === "published") result.published += 1;
    else if (update.status === "failed") result.failed += 1;
    else if (step.kind === "failed") result.retrying += 1;
    else result.waiting += 1;
    const notification = notificationFor(target, update);
    if (notification) notifications.push(notification);
  }

  cached = null;
  await deps.store.settlePosts([...touched]);
  await deps.notify(notifications).catch((error: unknown) => console.warn(`[publish] notify failed: ${error instanceof Error ? error.name : "unknown"}`));
  return result;
}
