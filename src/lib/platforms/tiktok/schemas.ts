import { z } from "zod";

/** TikTok API v2 responses (open.tiktokapis.com). */

export const tiktokTokenSchema = z.object({
  access_token: z.string().min(1),
  /** Seconds (about 24 h). */
  expires_in: z.number(),
  open_id: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  /** Seconds (about 365 days). */
  refresh_expires_in: z.number().optional(),
  /** Comma-separated scopes the user actually granted. */
  scope: z.string().optional(),
  token_type: z.string().optional(),
});
export type TikTokToken = z.infer<typeof tiktokTokenSchema>;

const apiError = z.object({ code: z.string(), message: z.string().optional(), log_id: z.string().optional() });

export const userInfoSchema = z.object({
  // Error answers come with an empty data object: read error.code first.
  data: z.object({
    user: z.object({
      open_id: z.string().optional(),
      union_id: z.string().optional(),
      avatar_url: z.string().optional(),
      display_name: z.string().optional(),
      username: z.string().optional(),
      follower_count: z.number().optional(),
      following_count: z.number().optional(),
      likes_count: z.number().optional(),
      video_count: z.number().optional(),
    }).optional(),
  }).optional(),
  error: apiError.optional(),
});
export type TikTokUser = NonNullable<NonNullable<z.infer<typeof userInfoSchema>["data"]>["user"]>;

export const videoSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  video_description: z.string().optional(),
  create_time: z.number().optional(),
  cover_image_url: z.string().optional(),
  share_url: z.string().optional(),
  duration: z.number().optional(),
  view_count: z.number().optional(),
  like_count: z.number().optional(),
  comment_count: z.number().optional(),
  share_count: z.number().optional(),
});
export type TikTokVideo = z.infer<typeof videoSchema>;

export const videoListSchema = z.object({
  data: z
    .object({
      videos: z.array(videoSchema).optional(),
      cursor: z.number().optional(),
      has_more: z.boolean().optional(),
    })
    .optional(),
  error: apiError.optional(),
});
