import type { AccessTokenGetter } from "@/lib/oauth/token-store";
import type { FetchFn, RetryOptions } from "@/lib/platforms/http";

/**
 * Publishing: each network is a small state machine advanced by the publish
 * cron. `state` survives between runs (container ids, upload sessions...), so
 * a network that processes the video slowly finishes on a later run.
 */

export type PublishPlatform = "youtube" | "instagram" | "facebook" | "tiktok";

export type PublishVideo = { driveFileId: string; name: string | null; mimeType: string | null; sizeBytes: number | null };

export type PublishJob = {
  targetId: string;
  platform: PublishPlatform;
  accountId: string;
  /** Network id of the account: channel, IG user, Page or TikTok open_id. */
  externalAccountId: string;
  caption: string;
  /** YouTube title. */
  title: string | null;
  video: PublishVideo;
  state: Record<string, unknown>;
  attempts: number;
};

export type PublishStep =
  | { kind: "published"; externalId: string; permalink: string | null; note?: string }
  | { kind: "waiting"; state: Record<string, unknown>; checkAfterSeconds: number }
  | { kind: "failed"; error: string; retryable: boolean };

export type PublishContext = {
  getAccessToken: AccessTokenGetter;
  /** The video bytes from Google Drive (downloaded once per run and post). */
  downloadVideo: () => Promise<Uint8Array>;
  fetch: FetchFn;
  retry?: RetryOptions;
  graphVersion: string;
  now: () => Date;
};

export interface Publisher {
  advance(job: PublishJob, ctx: PublishContext): Promise<PublishStep>;
}

/** A clear, user-facing failure that retrying will not fix (missing permission, rejected video...). */
export class PublishError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "PublishError";
  }
}
