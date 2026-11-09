import { z } from "zod";
import { HttpError } from "@/lib/platforms/http";
import type { MetaClient } from "./client";

/**
 * Competitor benchmark through Instagram `business_discovery`: public numbers
 * of other business or creator accounts (followers, posts, likes and comments
 * of recent posts). Views and reach of other accounts are not available.
 */

export const COMPETITOR_RECENT_POSTS = 25;
/** Averages use the most recent posts only. */
export const COMPETITOR_AVERAGE_POSTS = 12;

export const igUsernameSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^@/, "").toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9._]{1,30}$/, "Usuario de Instagram no válido"));

const discoverySchema = z.object({
  business_discovery: z.object({
    username: z.string().optional(),
    name: z.string().optional(),
    profile_picture_url: z.string().optional(),
    followers_count: z.number().optional(),
    media_count: z.number().optional(),
    media: z
      .object({
        data: z.array(
          z.object({
            timestamp: z.string().optional(),
            like_count: z.number().optional(),
            comments_count: z.number().optional(),
            media_product_type: z.string().optional(),
          }),
        ),
      })
      .optional(),
  }),
});
export type Discovery = z.infer<typeof discoverySchema>["business_discovery"];

export type CompetitorProfile = { name: string | null; avatarUrl: string | null };
export type CompetitorMetric = { metric: string; value: number };

export async function fetchCompetitor(graph: MetaClient, igUserId: string, username: string): Promise<Discovery> {
  const fields = `business_discovery.username(${username}){username,name,profile_picture_url,followers_count,media_count,media.limit(${COMPETITOR_RECENT_POSTS}){timestamp,like_count,comments_count,media_product_type}}`;
  const body = await graph.get(igUserId, { fields }, discoverySchema, "meta.ig.business_discovery");
  return body.business_discovery;
}

const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

/**
 * Daily metrics of a competitor: followers, posts, posting frequency and the
 * average likes / comments / engagement of its latest posts. Hidden like counts
 * are left out of the averages, never counted as 0.
 */
export function competitorMetrics(discovery: Discovery, now: Date): CompetitorMetric[] {
  const media = discovery.media?.data ?? [];
  const recent = media.slice(0, COMPETITOR_AVERAGE_POSTS);
  const within = (days: number) =>
    media.filter((item) => item.timestamp && now.getTime() - Date.parse(item.timestamp) <= days * 86_400_000).length;
  const avgLikes = average(recent.flatMap((item) => (typeof item.like_count === "number" ? [item.like_count] : [])));
  const avgComments = average(recent.flatMap((item) => (typeof item.comments_count === "number" ? [item.comments_count] : [])));
  const followers = discovery.followers_count;
  const engagement =
    followers && (avgLikes !== null || avgComments !== null) ? (((avgLikes ?? 0) + (avgComments ?? 0)) / followers) * 100 : null;

  const values: [string, number | null | undefined][] = [
    ["followers_count", followers],
    ["media_count", discovery.media_count],
    // Only meaningful when the 25 fetched posts reach back that far.
    ["posts_last_7d", media.length ? within(7) : null],
    ["posts_last_30d", media.length ? within(30) : null],
    ["avg_likes_recent", avgLikes],
    ["avg_comments_recent", avgComments],
    ["engagement_rate_recent", engagement],
  ];
  return values.flatMap(([metric, value]) => (typeof value === "number" && Number.isFinite(value) ? [{ metric, value }] : []));
}

export function competitorProfile(discovery: Discovery): CompetitorProfile {
  return { name: discovery.name ?? null, avatarUrl: discovery.profile_picture_url ?? null };
}

/** Meta refuses business_discovery for personal accounts and unknown usernames. */
export function isUnavailableCompetitor(error: unknown): error is HttpError {
  return error instanceof HttpError && error.status === 400;
}
