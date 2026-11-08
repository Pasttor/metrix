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
