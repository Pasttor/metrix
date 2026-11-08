import { z } from "zod";
import { dateInTimeZone } from "@/lib/dates";
import type { Json } from "@/lib/db/types";
import type { FetchFn, RetryOptions } from "@/lib/platforms/http";
import { createYouTubeClient } from "./client";
import { retentionFromReport, type RetentionPoint } from "./parsers";
import { ANALYTICS_TIME_ZONE } from "./sync";

/** The curve changes slowly; refetch a cached one after this long. */
export const RETENTION_CACHE_MS = 7 * 86_400_000;
const YOUTUBE_LAUNCH = "2005-04-23";

const cachedSchema = z.object({
  fetchedAt: z.string(),
  points: z.array(z.object({ ratio: z.number(), audienceWatchRatio: z.number() })),
});

export type RetentionPost = { accountId: string; externalId: string; publishedAt: string | null; raw: Json };

export type RetentionDeps = {
  getPost: (postId: string) => Promise<RetentionPost | null>;
  savePostRaw: (postId: string, raw: Json) => Promise<void>;
  getAccessToken: (accountId: string) => Promise<string>;
  fetch?: FetchFn;
  retry?: RetryOptions;
  now?: () => Date;
};

function rawObject(raw: Json): Record<string, Json | undefined> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

/**
 * Audience retention curve of a video (`elapsedVideoTimeRatio` → `audienceWatchRatio`),
 * fetched on demand and cached in `posts.raw.retention`. Returns null for an unknown post.
 */
export async function getRetentionCurve(postId: string, deps: RetentionDeps): Promise<RetentionPoint[] | null> {
  const now = deps.now?.() ?? new Date();
  const post = await deps.getPost(postId);
  if (!post) return null;

  const raw = rawObject(post.raw);
  const cached = cachedSchema.safeParse(raw.retention);
  if (cached.success && now.getTime() - new Date(cached.data.fetchedAt).getTime() < RETENTION_CACHE_MS) {
    return cached.data.points;
  }

  const client = createYouTubeClient({ accessToken: await deps.getAccessToken(post.accountId), fetch: deps.fetch, retry: deps.retry });
  const report = await client.queryReport({
    startDate: post.publishedAt ? dateInTimeZone(new Date(post.publishedAt), ANALYTICS_TIME_ZONE) : YOUTUBE_LAUNCH,
    endDate: dateInTimeZone(now, ANALYTICS_TIME_ZONE),
    metrics: ["audienceWatchRatio"],
    dimensions: ["elapsedVideoTimeRatio"],
    filters: `video==${post.externalId}`,
    sort: "elapsedVideoTimeRatio",
  });
  const points = retentionFromReport(report);
  await deps.savePostRaw(postId, { ...raw, retention: { fetchedAt: now.toISOString(), points } } as Json);
  return points;
}
