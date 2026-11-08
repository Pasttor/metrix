import { z } from "zod";
import { addDays, dateInTimeZone } from "@/lib/dates";
import type { Json } from "@/lib/db/types";
import type { AccessTokenGetter } from "@/lib/oauth/token-store";
import { HttpError, type FetchFn, type RetryOptions } from "@/lib/platforms/http";
import { createYouTubeClient, type AnalyticsQuery } from "./client";
import { retentionFromReport, type RetentionPoint } from "./parsers";
import { ANALYTICS_TIME_ZONE, isUnauthorized } from "./sync";

/** A recent video's curve still moves every day; an older one barely changes. */
export const RETENTION_CACHE_MS = 7 * 86_400_000;
export const RECENT_RETENTION_CACHE_MS = 86_400_000;
export const RECENT_VIDEO_MS = 30 * 86_400_000;
const YOUTUBE_LAUNCH = "2005-04-23";

const cachedSchema = z.object({
  fetchedAt: z.string(),
  points: z.array(
    z.object({ ratio: z.number(), audienceWatchRatio: z.number(), relativePerformance: z.number().nullable().optional() }),
  ),
});

export type RetentionPost = { accountId: string; externalId: string; publishedAt: string | null; raw: Json };

export type RetentionDeps = {
  getPost: (postId: string) => Promise<RetentionPost | null>;
  savePostRaw: (postId: string, raw: Json) => Promise<void>;
  getAccessToken: AccessTokenGetter;
  fetch?: FetchFn;
  retry?: RetryOptions;
  now?: () => Date;
};

function rawObject(raw: Json): Record<string, Json | undefined> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

export function retentionCacheMs(publishedAt: string | null, now: Date): number {
  const age = publishedAt ? now.getTime() - new Date(publishedAt).getTime() : Infinity;
  return age < RECENT_VIDEO_MS ? RECENT_RETENTION_CACHE_MS : RETENTION_CACHE_MS;
}

/**
 * Audience retention curve of a video: `audienceWatchRatio` (can exceed 1 when
 * viewers rewatch, typical in Shorts) and `relativeRetentionPerformance` (vs
 * YouTube videos of similar length; 0.5 is the median) per `elapsedVideoTimeRatio`.
 * Fetched on demand and cached in `posts.raw.retention`. Returns null for an unknown post.
 */
export async function getRetentionCurve(postId: string, deps: RetentionDeps): Promise<RetentionPoint[] | null> {
  const now = deps.now?.() ?? new Date();
  const post = await deps.getPost(postId);
  if (!post) return null;

  const raw = rawObject(post.raw);
  const cached = cachedSchema.safeParse(raw.retention);
  if (cached.success && now.getTime() - new Date(cached.data.fetchedAt).getTime() < retentionCacheMs(post.publishedAt, now)) {
    return cached.data.points.map((point) => ({ ...point, relativePerformance: point.relativePerformance ?? null }));
  }

  const request: Omit<AnalyticsQuery, "metrics"> = {
    // A day of margin: the publish instant can fall on the previous Pacific day.
    startDate: post.publishedAt ? addDays(dateInTimeZone(new Date(post.publishedAt), ANALYTICS_TIME_ZONE), -1) : YOUTUBE_LAUNCH,
    endDate: dateInTimeZone(now, ANALYTICS_TIME_ZONE),
    dimensions: ["elapsedVideoTimeRatio"],
    filters: `video==${post.externalId}`,
    // The retention report accepts no sort parameter; points are ordered below.
  };
  const accountId = post.accountId;

  async function query(metrics: string[], forceRefresh = false) {
    const accessToken = await deps.getAccessToken(accountId, { forceRefresh });
    return createYouTubeClient({ accessToken, fetch: deps.fetch, retry: deps.retry }).queryReport({ ...request, metrics });
  }

  async function queryWithAuthRetry(metrics: string[]) {
    try {
      return await query(metrics);
    } catch (error) {
      // A 401 on an unexpired token means it was revoked: refresh once before giving up.
      if (!isUnauthorized(error)) throw error;
      return query(metrics, true);
    }
  }

  const report = await queryWithAuthRetry(["audienceWatchRatio", "relativeRetentionPerformance"]).catch((error: unknown) => {
    // Relative performance is optional: fall back to the plain curve if YouTube rejects it.
    if (error instanceof HttpError && error.status === 400) return queryWithAuthRetry(["audienceWatchRatio"]);
    throw error;
  });

  const points = retentionFromReport(report).sort((a, b) => a.ratio - b.ratio);
  await deps.savePostRaw(postId, { ...raw, retention: { fetchedAt: now.toISOString(), points } } as Json);
  return points;
}
