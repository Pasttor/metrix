import { z } from "zod";

/**
 * Per-network choices the user makes for each post (stored in
 * scheduled_post_targets.options). TikTok's Content Sharing Guidelines require
 * the user to pick the privacy level (no default), the interaction settings
 * (unchecked by default) and the commercial content disclosure on every post.
 */

export const TIKTOK_PRIVACY_LEVELS = ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"] as const;
export type TikTokPrivacyLevel = (typeof TIKTOK_PRIVACY_LEVELS)[number];

export const TIKTOK_PRIVACY_LABELS: Record<TikTokPrivacyLevel, string> = {
  PUBLIC_TO_EVERYONE: "Todos",
  MUTUAL_FOLLOW_FRIENDS: "Amigos (seguidores que sigues)",
  FOLLOWER_OF_CREATOR: "Seguidores",
  SELF_ONLY: "Solo yo",
};

export const TIKTOK_MUSIC_URL = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
export const TIKTOK_BRANDED_URL = "https://www.tiktok.com/legal/page/global/bc-policy/en";
export const YOUTUBE_TERMS_URL = "https://www.youtube.com/t/terms";

export const tiktokOptionsSchema = z
  .object({
    privacyLevel: z.enum(TIKTOK_PRIVACY_LEVELS, { error: "Elige quién puede ver el video en TikTok." }),
    allowComment: z.boolean(),
    allowDuet: z.boolean(),
    allowStitch: z.boolean(),
    /** The "Disclose video content" toggle. */
    commercial: z.boolean(),
    yourBrand: z.boolean(),
    brandedContent: z.boolean(),
  })
  .refine((value) => !value.commercial || value.yourBrand || value.brandedContent, {
    error: "Indica si el contenido comercial de TikTok promociona tu marca, a un tercero o ambos.",
  })
  .refine((value) => !(value.commercial && value.brandedContent && value.privacyLevel === "SELF_ONLY"), {
    error: "En TikTok, el contenido de marca no puede publicarse como «Solo yo».",
  })
  .transform((value) => (value.commercial ? value : { ...value, yourBrand: false, brandedContent: false }));

export type TikTokOptions = z.output<typeof tiktokOptionsSchema>;

export const YOUTUBE_PRIVACY_LEVELS = ["public", "unlisted", "private"] as const;
export type YouTubePrivacy = (typeof YOUTUBE_PRIVACY_LEVELS)[number];

export const YOUTUBE_PRIVACY_LABELS: Record<YouTubePrivacy, string> = {
  public: "Público",
  unlisted: "No listado",
  private: "Privado",
};

export const youtubeOptionsSchema = z.object({
  privacy: z.enum(YOUTUBE_PRIVACY_LEVELS, { error: "Elige la visibilidad del video en YouTube." }),
  madeForKids: z.boolean({ error: "Indica si el video de YouTube está hecho para niños." }),
});

export type YouTubeOptions = z.output<typeof youtubeOptionsSchema>;

/** What TikTok's creator_info returns, as the form shows it. */
export type TikTokCreator = {
  nickname: string | null;
  username: string | null;
  avatarUrl: string | null;
  privacyOptions: TikTokPrivacyLevel[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxDurationSec: number | null;
};

/** The label TikTok adds to the post, per the commercial content choices. */
export function tiktokCommercialLabel(options: Pick<TikTokOptions, "commercial" | "yourBrand" | "brandedContent">): string | null {
  if (!options.commercial) return null;
  if (options.brandedContent) return "Tu video se etiquetará como «Colaboración pagada» (Paid partnership).";
  if (options.yourBrand) return "Tu video se etiquetará como «Contenido promocional» (Promotional content).";
  return null;
}
