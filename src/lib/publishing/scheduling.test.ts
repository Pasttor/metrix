import { describe, expect, it } from "vitest";
import { utcToZonedInput, zonedTimeToUtc } from "@/lib/dates";
import { buildSchedule, readScheduleForm, type PublishAccount, type ScheduleInput } from "./scheduling";

const NOW = new Date("2026-11-09T18:00:00Z");
const TZ = "America/Mexico_City";
const ACCOUNTS: PublishAccount[] = [
  { id: "00000000-0000-4000-8000-000000000001", platform: "instagram", name: "IG", handle: "metrix" },
  { id: "00000000-0000-4000-8000-000000000002", platform: "youtube", name: "YT", handle: "metrix" },
  { id: "00000000-0000-4000-8000-000000000003", platform: "facebook", name: "Página A", handle: null },
  { id: "00000000-0000-4000-8000-000000000004", platform: "facebook", name: "Página B", handle: null },
  { id: "00000000-0000-4000-8000-000000000005", platform: "tiktok", name: "TT", handle: "metrix" },
];

const TIKTOK = { privacyLevel: "SELF_ONLY", allowComment: true, allowDuet: false, allowStitch: false, commercial: false, yourBrand: false, brandedContent: false };
const YOUTUBE = { privacy: "public", madeForKids: false };

function input(overrides: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    driveFileId: "1AbCdEfGhIjKlMnOp",
    driveFileName: "reel.mp4",
    driveMimeType: "video/mp4",
    driveSizeBytes: "1000",
    caption: "Hola #metrix",
    accountIds: [ACCOUNTS[0].id, ACCOUNTS[1].id],
    when: "now",
    captions: {},
    youtube: YOUTUBE,
    tiktok: TIKTOK,
    ...overrides,
  };
}

describe("zoned time", () => {
  it("reads wall-clock time in Mexico City (UTC-6, no DST)", () => {
    expect(zonedTimeToUtc("2026-11-10T09:30", TZ)?.toISOString()).toBe("2026-11-10T15:30:00.000Z");
    expect(utcToZonedInput(new Date("2026-11-10T15:30:00Z"), TZ)).toBe("2026-11-10T09:30");
  });

  it("handles DST zones and rejects bad input", () => {
    expect(zonedTimeToUtc("2026-07-01T12:00", "America/New_York")?.toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(zonedTimeToUtc("2026-02-30T12:00", TZ)).toBeNull();
    expect(zonedTimeToUtc("mañana", TZ)).toBeNull();
  });
});

describe("buildSchedule", () => {
  it("builds the post and one target per network", () => {
    const result = buildSchedule(input({ youtubeTitle: "Mi título", captions: { instagram: "Texto IG" } }), ACCOUNTS, NOW, TZ);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.post).toMatchObject({ drive_file_id: "1AbCdEfGhIjKlMnOp", drive_size_bytes: 1000, scheduled_at: NOW.toISOString() });
    expect(result.rows.targets).toEqual([
      { platform: "instagram", account_id: ACCOUNTS[0].id, caption: "Texto IG", title: null, options: {} },
      { platform: "youtube", account_id: ACCOUNTS[1].id, caption: null, title: "Mi título", options: YOUTUBE },
    ]);
  });

  it("requires the TikTok and YouTube choices, with no defaults", () => {
    const fail = (overrides: Partial<ScheduleInput>) => {
      const result = buildSchedule(input(overrides), ACCOUNTS, NOW, TZ);
      return result.ok ? null : result.message;
    };
    const withTikTok = { accountIds: [ACCOUNTS[4].id] };
    expect(fail({ ...withTikTok, tiktok: { ...TIKTOK, privacyLevel: undefined } })).toBe("Elige quién puede ver el video en TikTok.");
    expect(fail({ ...withTikTok, tiktok: { ...TIKTOK, commercial: true } })).toContain("tu marca, a un tercero o ambos");
    expect(fail({ ...withTikTok, tiktok: { ...TIKTOK, commercial: true, brandedContent: true } })).toContain("no puede publicarse como «Solo yo»");
    expect(fail({ accountIds: [ACCOUNTS[1].id], youtube: { madeForKids: false } })).toBe("Elige la visibilidad del video en YouTube.");
    expect(fail({ accountIds: [ACCOUNTS[1].id], youtube: { privacy: "public" } })).toBe("Indica si el video de YouTube está hecho para niños.");
  });

  it("stores the TikTok choices and drops brand flags when the disclosure is off", () => {
    const result = buildSchedule(input({ accountIds: [ACCOUNTS[4].id], tiktok: { ...TIKTOK, privacyLevel: "FOLLOWER_OF_CREATOR", yourBrand: true } }), ACCOUNTS, NOW, TZ);
    expect(result.ok && result.rows.targets[0].options).toEqual({ ...TIKTOK, privacyLevel: "FOLLOWER_OF_CREATOR", yourBrand: false });
  });

  it("converts the scheduled time from Mexico City", () => {
    const result = buildSchedule(input({ when: "later", scheduledAt: "2026-11-10T09:30" }), ACCOUNTS, NOW, TZ);
    expect(result.ok && result.rows.post.scheduled_at).toBe("2026-11-10T15:30:00.000Z");
  });

  it("rejects bad forms with a clear message", () => {
    const fail = (overrides: Partial<ScheduleInput>) => {
      const result = buildSchedule(input(overrides), ACCOUNTS, NOW, TZ);
      return result.ok ? null : result.message;
    };
    expect(fail({ driveFileId: "" })).toBe("Elige un video de Google Drive.");
    expect(fail({ accountIds: [] })).toBe("Elige al menos una red.");
    expect(fail({ driveMimeType: "image/png" })).toBe("El archivo elegido no es un video.");
    expect(fail({ accountIds: [ACCOUNTS[2].id, ACCOUNTS[3].id] })).toBe("Elige una sola cuenta por red.");
    expect(fail({ accountIds: ["00000000-0000-4000-8000-000000000009"] })).toBe("Una de las cuentas elegidas ya no está conectada.");
    expect(fail({ when: "later", scheduledAt: "2026-11-01T09:00" })).toBe("La fecha ya pasó.");
    expect(fail({ when: "later" })).toBe("Elige la fecha y la hora.");
    expect(fail({ caption: "" })).toBe("Escribe el texto de la publicación.");
    expect(fail({ caption: "x".repeat(2201) })).toContain("2200");
  });

  it("lets a YouTube-only post go without caption", () => {
    expect(buildSchedule(input({ caption: "", accountIds: [ACCOUNTS[1].id] }), ACCOUNTS, NOW, TZ).ok).toBe(true);
  });
});

describe("readScheduleForm", () => {
  it("reads the fields the form sends", () => {
    const form = new FormData();
    form.set("driveFileId", "1AbCdEfGhIjKlMnOp");
    form.set("caption", "  Hola  ");
    form.append("accountIds", ACCOUNTS[0].id);
    form.append("accountIds", ACCOUNTS[1].id);
    form.set("when", "later");
    form.set("scheduledAt", "2026-11-10T09:30");
    form.set("caption_tiktok", "Solo TikTok");
    form.set("caption_instagram", "   ");
    form.set("tiktokPrivacy", "PUBLIC_TO_EVERYONE");
    form.set("tiktokAllowComment", "on");
    form.set("tiktokCommercial", "on");
    form.set("tiktokBrandedContent", "on");
    form.set("youtubePrivacy", "unlisted");
    form.set("youtubeMadeForKids", "no");
    expect(readScheduleForm(form)).toMatchObject({
      caption: "Hola",
      accountIds: [ACCOUNTS[0].id, ACCOUNTS[1].id],
      when: "later",
      captions: { tiktok: "Solo TikTok" },
      tiktok: { privacyLevel: "PUBLIC_TO_EVERYONE", allowComment: true, allowDuet: false, allowStitch: false, commercial: true, yourBrand: false, brandedContent: true },
      youtube: { privacy: "unlisted", madeForKids: false },
    });
  });
});
