import { z } from "zod";

/** Google OAuth token endpoint (authorization_code and refresh_token grants). */
export const googleTokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  refresh_token: z.string().min(1).optional(),
  /** Present when the grant is time-limited (for example, an app left in Testing). */
  refresh_token_expires_in: z.number().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});
export type GoogleToken = z.infer<typeof googleTokenSchema>;

const thumbnailSchema = z.object({ url: z.string() });

/** YouTube Data API v3 `channels.list` with part=snippet,statistics,contentDetails. */
export const channelSchema = z.object({
  id: z.string().min(1),
  snippet: z.object({
    title: z.string(),
    customUrl: z.string().optional(),
    publishedAt: z.string().optional(),
    thumbnails: z
      .object({ default: thumbnailSchema.optional(), medium: thumbnailSchema.optional(), high: thumbnailSchema.optional() })
      .optional(),
  }),
  statistics: z
    .object({
      viewCount: z.string().optional(),
      subscriberCount: z.string().optional(),
      hiddenSubscriberCount: z.boolean().optional(),
      videoCount: z.string().optional(),
    })
    .optional(),
  contentDetails: z.object({ relatedPlaylists: z.object({ uploads: z.string().optional() }).optional() }).optional(),
});
export type Channel = z.infer<typeof channelSchema>;

export const channelListSchema = z.object({
  items: z.array(channelSchema).optional(),
});
