import { z } from "zod";
import { dateInTimeZone } from "@/lib/dates";
import type { AccessTokenGetter } from "@/lib/oauth/token-store";
import { HttpError, type FetchFn, type RetryOptions } from "@/lib/platforms/http";
import type { MetricsStore, PostMetricValue, PostUpsert } from "@/lib/sync/metrics-store";
import type { AccountSyncInput, AccountSyncResult, Syncer } from "@/lib/sync/types";
import { createTikTokClient, USER_FIELDS, userFieldsFor, type TikTokClient } from "./client";
import type { TikTokUser, TikTokVideo } from "./schemas";

/**
 * TikTok has no daily series: every run snapshots the profile counters and the
 * cumulative counters of every video; history starts the day the account connects.
 * Daily and backfill do the same.
 */

const STEPS = ["profile", "videos"] as const;
const cursorSchema = z.object({ step: z.enum(STEPS), videoCursor: z.number().optional() });
type Cursor = z.infer<typeof cursorSchema>;

const PROFILE_METRICS = ["follower_count", "following_count", "likes_count", "video_count"] as const;
const VIDEO_METRICS = ["view_count", "like_count", "comment_count", "share_count"] as const;

export type TikTokSyncDeps = {
  getAccessToken: AccessTokenGetter;
  store: MetricsStore;
  reportTimeZone: string;
  fetch?: FetchFn;
  retry?: RetryOptions;
};

function isUnauthorized(error: unknown) {
  return error instanceof HttpError && (error.status === 401 || /access_token_invalid|token_expired/.test(error.code));
}

/** A scope the user did not grant: TikTok answers scope_not_authorized. */
function isScopeError(error: unknown) {
  return error instanceof HttpError && /scope_not_authorized|scope_permission_missed/.test(error.code);
}

export function profileMetrics(user: TikTokUser, date: string) {
  return PROFILE_METRICS.flatMap((metric) => (typeof user[metric] === "number" ? [{ date, metric, value: user[metric] as number }] : []));
}

export function videoToPost(video: TikTokVideo): PostUpsert {
  const text = video.title?.trim() || video.video_description?.trim() || null;
  return {
    externalId: video.id,
    type: "video",
    caption: text,
    permalink: video.share_url ?? null,
    thumbnailUrl: video.cover_image_url ?? null,
    publishedAt: video.create_time ? new Date(video.create_time * 1000).toISOString() : null,
    durationSeconds: typeof video.duration === "number" ? Math.round(video.duration) : null,
  };
}

export function videoMetrics(video: TikTokVideo) {
  return VIDEO_METRICS.flatMap((metric) => (typeof video[metric] === "number" ? [{ metric, value: video[metric] as number }] : []));
}

export function createTikTokSyncer(deps: TikTokSyncDeps): Syncer {
  return {
    async syncAccount({ account, cursor: rawCursor, shouldStop, now }: AccountSyncInput): Promise<AccountSyncResult> {
      const connect = async (forceRefresh: boolean) =>
        createTikTokClient({ accessToken: await deps.getAccessToken(account.id, { forceRefresh }), fetch: deps.fetch, retry: deps.retry });
      let client: TikTokClient = await connect(false);
      const warnings = new Set<string>();
      let rowsWritten = 0;
      const reportDate = dateInTimeZone(now, deps.reportTimeZone);
      const parsed = cursorSchema.safeParse(rawCursor);
      const resume: Cursor | null = parsed.success ? parsed.data : null;

      const result = (done: boolean, cursor?: Cursor): AccountSyncResult => ({
        done,
        ...(cursor ? { cursor } : {}),
        rowsWritten,
        warnings: [...warnings],
        quotaUnits: client.calls,
        progress: done ? 1 : 0.5,
      });

      if (!resume || resume.step === "profile") {
        let user: TikTokUser;
        try {
          user = await client.userInfo(userFieldsFor(null));
        } catch (error) {
          if (isUnauthorized(error)) {
            // 401 on an unexpired token: refresh once (TikTok tokens last ~24 h).
            client = await connect(true);
            user = await client.userInfo(userFieldsFor(null));
          } else if (isScopeError(error)) {
            warnings.add("TikTok no concedió permiso para estadísticas o perfil; solo se guardan los datos básicos");
            user = await client.userInfo([...USER_FIELDS["user.info.basic"]]);
          } else {
            throw error;
          }
        }
        const rows = profileMetrics(user, reportDate);
        if (rows.length > 0) rowsWritten += await deps.store.upsertAccountMetrics(account.id, rows);
      }

      let videoCursor = resume?.step === "videos" ? resume.videoCursor : undefined;
      try {
        for (;;) {
          const page = await client.listVideos(videoCursor);
          if (page.videos.length > 0) {
            const ids = await deps.store.upsertPosts(account.id, page.videos.map(videoToPost));
            rowsWritten += ids.size;
            const metrics: PostMetricValue[] = page.videos.flatMap((video) => {
              const postId = ids.get(video.id);
              return postId ? videoMetrics(video).map((row) => ({ postId, ...row })) : [];
            });
            if (metrics.length > 0) rowsWritten += await deps.store.upsertPostMetrics(reportDate, metrics);
          }
          if (!page.hasMore || page.cursor === undefined) break;
          videoCursor = page.cursor;
          if (shouldStop()) return result(false, { step: "videos", videoCursor });
        }
      } catch (error) {
        if (!isScopeError(error)) throw error;
        warnings.add("TikTok no concedió el permiso video.list; no se pueden leer los videos");
      }

      return result(true);
    },
  };
}
