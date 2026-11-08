import { z } from "zod";

/** `GET /oauth/access_token` (code exchange and fb_exchange_token). */
export const metaTokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  /** Seconds; omitted for tokens that do not expire. */
  expires_in: z.number().optional(),
});
export type MetaToken = z.infer<typeof metaTokenSchema>;

/** `GET /me/permissions`. */
export const permissionsSchema = z.object({
  data: z.array(z.object({ permission: z.string(), status: z.string() })),
});

const pictureSchema = z.object({ data: z.object({ url: z.string().optional() }).optional() });

export const pageSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  username: z.string().optional(),
  /** Page access token; does not expire when derived from a long-lived user token. */
  access_token: z.string().min(1).optional(),
  picture: pictureSchema.optional(),
  instagram_business_account: z
    .object({ id: z.string().min(1), username: z.string().optional(), profile_picture_url: z.string().optional() })
    .optional(),
});
export type Page = z.infer<typeof pageSchema>;

export const businessSchema = z.object({ id: z.string().min(1) });

/** Any paginated Graph edge. `paging.next` is a full URL with the token in it: never log it. */
export function pagedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    paging: z.object({ next: z.string().optional() }).optional(),
  });
}

/** `GET /{ig-user-id}?fields=followers_count,media_count`. */
export const igProfileSchema = z.object({
  id: z.string().optional(),
  username: z.string().optional(),
  followers_count: z.number().optional(),
  media_count: z.number().optional(),
});

/** `GET /{ig-user-id}/media` and `/stories` items. */
export const igMediaSchema = z.object({
  id: z.string().min(1),
  caption: z.string().optional(),
  media_type: z.string().optional(),
  media_product_type: z.string().optional(),
  permalink: z.string().optional(),
  thumbnail_url: z.string().optional(),
  media_url: z.string().optional(),
  timestamp: z.string().optional(),
});
export type IgMedia = z.infer<typeof igMediaSchema>;

const breakdownSchema = z.object({
  dimension_keys: z.array(z.string()).optional(),
  results: z.array(z.object({ dimension_values: z.array(z.string()), value: z.number() })).optional(),
});

/** `GET /{id}/insights`: `values` (time series / lifetime) or `total_value` (with optional breakdowns). */
export const insightsSchema = z.object({
  data: z.array(
    z.object({
      name: z.string(),
      period: z.string().optional(),
      values: z.array(z.object({ value: z.unknown(), end_time: z.string().optional() })).optional(),
      total_value: z.object({ value: z.number().optional(), breakdowns: z.array(breakdownSchema).optional() }).optional(),
    }),
  ),
});
export type Insights = z.infer<typeof insightsSchema>;

/** `GET /{page-id}?fields=followers_count,fan_count`. */
export const fbPageProfileSchema = z.object({ followers_count: z.number().optional(), fan_count: z.number().optional() });

const summarySchema = z.object({ summary: z.object({ total_count: z.number().optional() }).optional() });

/** `GET /{page-id}/published_posts` items. `shares` is omitted when nobody shared. */
export const fbPostSchema = z.object({
  id: z.string().min(1),
  message: z.string().optional(),
  created_time: z.string().optional(),
  permalink_url: z.string().optional(),
  full_picture: z.string().optional(),
  shares: z.object({ count: z.number() }).optional(),
  comments: summarySchema.optional(),
  reactions: summarySchema.optional(),
  attachments: z
    .object({
      data: z.array(z.object({ media_type: z.string().optional(), type: z.string().optional(), target: z.object({ id: z.string() }).optional() })),
    })
    .optional(),
});
export type FbPost = z.infer<typeof fbPostSchema>;

/** `GET /{video-id}?fields=length,video_insights.metric(...)`: length in seconds plus Reels insights. */
export const fbVideoSchema = z.object({
  length: z.number().optional(),
  video_insights: insightsSchema.optional(),
});
export type FbVideo = z.infer<typeof fbVideoSchema>;
