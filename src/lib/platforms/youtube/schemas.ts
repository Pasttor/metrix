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

/** `playlistItems.list` with part=contentDetails (the uploads playlist). */
export const playlistItemListSchema = z.object({
  nextPageToken: z.string().optional(),
  items: z
    .array(z.object({ contentDetails: z.object({ videoId: z.string().min(1), videoPublishedAt: z.string().optional() }) }))
    .optional(),
});

/** `videos.list` with part=snippet,statistics,contentDetails. */
export const videoSchema = z.object({
  id: z.string().min(1),
  snippet: z
    .object({
      title: z.string().optional(),
      publishedAt: z.string().optional(),
      liveBroadcastContent: z.string().optional(),
      thumbnails: z
        .object({
          default: thumbnailSchema.optional(),
          medium: thumbnailSchema.optional(),
          high: thumbnailSchema.optional(),
          standard: thumbnailSchema.optional(),
          maxres: thumbnailSchema.optional(),
        })
        .optional(),
    })
    .optional(),
  statistics: z
    .object({ viewCount: z.string().optional(), likeCount: z.string().optional(), commentCount: z.string().optional() })
    .optional(),
  contentDetails: z.object({ duration: z.string().optional() }).optional(),
});
export type Video = z.infer<typeof videoSchema>;

export const videoListSchema = z.object({ items: z.array(videoSchema).optional() });

/** YouTube Analytics API v2 `reports.query`. */
export const analyticsReportSchema = z.object({
  columnHeaders: z.array(z.object({ name: z.string(), columnType: z.string().optional(), dataType: z.string().optional() })),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).optional(),
});
export type AnalyticsReport = z.infer<typeof analyticsReportSchema>;
