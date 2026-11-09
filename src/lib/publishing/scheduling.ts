import { z } from "zod";
import { zonedTimeToUtc } from "@/lib/dates";
import type { PublishPlatform } from "./types";

/** Validates the /publicar form and turns it into rows for scheduled_posts and its targets. */

export const PUBLISH_PLATFORMS: PublishPlatform[] = ["instagram", "facebook", "youtube", "tiktok"];
/** Instagram and TikTok cap captions at 2,200 characters; Facebook and YouTube allow more. */
export const CAPTION_LIMIT = 2200;
export const TITLE_LIMIT = 100;
/** Small margin so "now" is not rejected by the time the form arrives. */
const PAST_TOLERANCE_MS = 5 * 60_000;
const MAX_AHEAD_MS = 180 * 86_400_000;

export type PublishAccount = { id: string; platform: PublishPlatform; name: string | null; handle: string | null };

const formSchema = z.object({
  driveFileId: z.string().regex(/^[\w-]{10,200}$/, "Elige un video de Google Drive."),
  driveFileName: z.string().max(500).optional(),
  driveMimeType: z.string().max(100).optional(),
  driveSizeBytes: z.coerce.number().int().nonnegative().optional(),
  caption: z.string().max(CAPTION_LIMIT, `El texto pasa de ${CAPTION_LIMIT} caracteres.`),
  accountIds: z.array(z.uuid()).min(1, "Elige al menos una red."),
  when: z.enum(["now", "later"]),
  scheduledAt: z.string().optional(),
  youtubeTitle: z.string().max(TITLE_LIMIT, `El título de YouTube pasa de ${TITLE_LIMIT} caracteres.`).optional(),
  captions: z.record(z.string(), z.string().max(CAPTION_LIMIT, `Un texto por red pasa de ${CAPTION_LIMIT} caracteres.`)),
});

export type ScheduleInput = z.input<typeof formSchema>;

export type ScheduleRows = {
  post: { caption: string; drive_file_id: string; drive_file_name: string | null; drive_mime_type: string | null; drive_size_bytes: number | null; scheduled_at: string };
  targets: { platform: PublishPlatform; account_id: string; caption: string | null; title: string | null }[];
};

export type ScheduleResult = { ok: true; rows: ScheduleRows } | { ok: false; message: string };

/** Reads the FormData the client form sends. */
export function readScheduleForm(formData: FormData): ScheduleInput {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : undefined;
  };
  const captions: Record<string, string> = {};
  for (const platform of PUBLISH_PLATFORMS) {
    const value = text(`caption_${platform}`)?.trim();
    if (value) captions[platform] = value;
  }
  return {
    driveFileId: text("driveFileId") ?? "",
    driveFileName: text("driveFileName") || undefined,
    driveMimeType: text("driveMimeType") || undefined,
    driveSizeBytes: text("driveSizeBytes") || undefined,
    caption: (text("caption") ?? "").trim(),
    accountIds: formData.getAll("accountIds").filter((value): value is string => typeof value === "string"),
    when: text("when") === "later" ? "later" : "now",
    scheduledAt: text("scheduledAt"),
    youtubeTitle: text("youtubeTitle")?.trim() || undefined,
    captions,
  };
}

export function buildSchedule(input: ScheduleInput, accounts: PublishAccount[], now: Date, timeZone: string): ScheduleResult {
  const parsed = formSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa el formulario." };
  const form = parsed.data;

  if (form.driveMimeType && !form.driveMimeType.startsWith("video/")) return { ok: false, message: "El archivo elegido no es un video." };

  const chosen = form.accountIds.map((id) => accounts.find((account) => account.id === id));
  if (chosen.some((account) => !account)) return { ok: false, message: "Una de las cuentas elegidas ya no está conectada." };
  const selected = chosen as PublishAccount[];
  const platforms = selected.map((account) => account.platform);
  if (new Set(platforms).size !== platforms.length) return { ok: false, message: "Elige una sola cuenta por red." };

  let scheduledAt = now;
  if (form.when === "later") {
    const instant = form.scheduledAt ? zonedTimeToUtc(form.scheduledAt, timeZone) : null;
    if (!instant) return { ok: false, message: "Elige la fecha y la hora." };
    if (instant.getTime() < now.getTime() - PAST_TOLERANCE_MS) return { ok: false, message: "La fecha ya pasó." };
    if (instant.getTime() > now.getTime() + MAX_AHEAD_MS) return { ok: false, message: "Solo se puede programar hasta 6 meses adelante." };
    scheduledAt = instant;
  }

  const captionFor = (platform: PublishPlatform) => form.captions[platform] ?? form.caption;
  if (selected.some((account) => !captionFor(account.platform)) && !platforms.every((platform) => platform === "youtube")) {
    return { ok: false, message: "Escribe el texto de la publicación." };
  }

  return {
    ok: true,
    rows: {
      post: {
        caption: form.caption,
        drive_file_id: form.driveFileId,
        drive_file_name: form.driveFileName ?? null,
        drive_mime_type: form.driveMimeType ?? null,
        drive_size_bytes: form.driveSizeBytes ?? null,
        scheduled_at: scheduledAt.toISOString(),
      },
      targets: selected.map((account) => ({
        platform: account.platform,
        account_id: account.id,
        caption: form.captions[account.platform] ?? null,
        title: account.platform === "youtube" ? (form.youtubeTitle ?? null) : null,
      })),
    },
  };
}
