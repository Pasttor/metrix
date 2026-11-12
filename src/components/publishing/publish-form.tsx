"use client";

import { useActionState, useState } from "react";
import { FolderOpen } from "lucide-react";
import { driveVideoDurationAction, schedulePostAction, type CreatorInfoResult } from "@/app/(dashboard)/publicar/actions";
import { NetworkIcon } from "@/components/overview/network-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { YOUTUBE_PRIVACY_LABELS, YOUTUBE_PRIVACY_LEVELS, YOUTUBE_TERMS_URL, type YouTubePrivacy } from "@/lib/publishing/options";
import { CAPTION_LIMIT, TITLE_LIMIT, type PublishAccount } from "@/lib/publishing/scheduling";
import type { PublishPlatform } from "@/lib/publishing/types";
import { pickDriveVideo, type PickedVideo } from "./drive-picker";
import { EMPTY_TIKTOK, TikTokOptions, tiktokBlocker, type TikTokChoices } from "./tiktok-options";

export type PickerConfig = { clientId: string; apiKey: string; appId: string; loginHint?: string };

const LABELS: Record<PublishPlatform, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok" };
const LIMITS: Partial<Record<PublishPlatform, string>> = {
  youtube: "Eliges la visibilidad abajo.",
  tiktok: "Eliges la privacidad y las interacciones abajo.",
  instagram: "Se publica como Reel.",
  facebook: "Se publica como Reel de la página.",
};

function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  return bytes >= 1_000_000_000 ? `${(bytes / 1_000_000_000).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
}

const selectClass =
  "h-9 w-full max-w-xs rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const textareaClass =
  "min-h-28 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function PublishForm({
  accounts,
  picker,
  pickerProblem,
  minScheduledAt,
  timeZoneLabel,
}: {
  accounts: PublishAccount[];
  picker: PickerConfig | null;
  /** Why the Picker cannot open (Drive not connected, missing keys). */
  pickerProblem: string | null;
  minScheduledAt: string;
  timeZoneLabel: string;
}) {
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [formKey, setFormKey] = useState(0);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [tiktok, setTiktok] = useState<TikTokChoices>(EMPTY_TIKTOK);
  const [creator, setCreator] = useState<CreatorInfoResult | null>(null);
  const [youtubePrivacy, setYoutubePrivacy] = useState<YouTubePrivacy | "">("");
  const [madeForKids, setMadeForKids] = useState<"" | "yes" | "no">("");

  const [state, action, pending] = useActionState(async (previous: Awaited<ReturnType<typeof schedulePostAction>> | null, formData: FormData) => {
    const result = await schedulePostAction(previous, formData);
    if (result.ok) {
      // Start a clean form for the next post.
      setVideo(null);
      setSelected([]);
      setCaption("");
      setWhen("now");
      setDurationSec(null);
      setTiktok(EMPTY_TIKTOK);
      setCreator(null);
      setYoutubePrivacy("");
      setMadeForKids("");
      setFormKey((key) => key + 1);
    }
    return result;
  }, null);

  const selectedPlatforms = accounts.filter((account) => selected.includes(account.id)).map((account) => account.platform);
  const tiktokAccount = accounts.find((account) => account.platform === "tiktok" && selected.includes(account.id)) ?? null;
  const youtubeSelected = selectedPlatforms.includes("youtube");
  const blocker =
    (tiktokAccount ? tiktokBlocker(tiktok, creator, durationSec) : null) ??
    (youtubeSelected && !youtubePrivacy ? "Elige la visibilidad del video en YouTube." : null) ??
    (youtubeSelected && !madeForKids ? "Indica si el video de YouTube está hecho para niños." : null);

  async function choose() {
    if (!picker) return;
    setPickError(null);
    setPicking(true);
    try {
      const picked = await pickDriveVideo(picker);
      if (picked && !picked.mimeType.startsWith("video/")) setPickError("Ese archivo no es un video.");
      else if (picked) {
        setVideo(picked);
        setDurationSec(null);
        // Used to check TikTok's maximum duration; null while Drive is still processing the video.
        driveVideoDurationAction(picked.id).then(setDurationSec, () => setDurationSec(null));
      }
    } catch (error) {
      setPickError(error instanceof Error ? error.message : "No se pudo abrir Google Drive.");
    } finally {
      setPicking(false);
    }
  }

  function toggle(account: PublishAccount, checked: boolean) {
    if (account.platform === "tiktok") {
      // A new TikTok selection starts from scratch: fresh creator info, no preselected choices.
      setCreator(null);
      setTiktok(EMPTY_TIKTOK);
    }
    setSelected((current) => {
      // One account per network: picking another account of the same network replaces it.
      const others = current.filter((id) => accounts.find((item) => item.id === id)?.platform !== account.platform);
      return checked ? [...others, account.id] : current.filter((id) => id !== account.id);
    });
  }

  return (
    <form key={formKey} action={action} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">1. Video</legend>
        {picker ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={choose} disabled={picking}>
              <FolderOpen aria-hidden />
              {picking ? "Abriendo Drive…" : video ? "Cambiar video" : "Elegir de Google Drive"}
            </Button>
            {video ? (
              <span className="text-sm">
                <a href={`https://drive.google.com/file/d/${encodeURIComponent(video.id)}/view`} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">
                  {video.name}
                </a>
                <span className="text-muted-foreground">
                  {" "}
                  · {formatSize(video.sizeBytes)}
                  {durationSec !== null ? ` · ${durationSec} s` : ""}
                </span>
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                {picker.loginHint ? `Se abre tu Drive de ${picker.loginHint}.` : "Usa la cuenta que conectaste en Google Drive."}
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{pickerProblem ?? "Google Drive no está disponible."}</p>
        )}
        {pickError ? (
          <p role="alert" className="text-sm text-destructive">
            {pickError}
          </p>
        ) : null}
        <input type="hidden" name="driveFileId" value={video?.id ?? ""} />
        <input type="hidden" name="driveFileName" value={video?.name ?? ""} />
        <input type="hidden" name="driveMimeType" value={video?.mimeType ?? ""} />
        <input type="hidden" name="driveSizeBytes" value={video?.sizeBytes ?? ""} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">2. Redes</legend>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay cuentas conectadas. Conéctalas en Configuración → Conexiones.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {accounts.map((account) => {
              const checked = selected.includes(account.id);
              return (
                <li key={account.id}>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${checked ? "border-ring bg-muted/50" : ""}`}>
                    <input type="checkbox" name="accountIds" value={account.id} checked={checked} onChange={(event) => toggle(account, event.target.checked)} className="mt-1 size-4" />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <NetworkIcon platform={account.platform} />
                        {LABELS[account.platform]}
                        <span className="truncate font-normal text-muted-foreground">{account.handle ? `@${account.handle}` : account.name}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">{LIMITS[account.platform]}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {tiktokAccount ? <TikTokOptions accountId={tiktokAccount.id} choices={tiktok} onChange={setTiktok} creator={creator} onCreator={setCreator} /> : null}

        {youtubeSelected ? (
          <fieldset className="flex flex-col gap-4 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">Opciones de YouTube</legend>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="youtube-privacy">Visibilidad</Label>
              <select
                id="youtube-privacy"
                name="youtubePrivacy"
                required
                value={youtubePrivacy}
                onChange={(event) => setYoutubePrivacy(event.target.value as YouTubePrivacy | "")}
                className={selectClass}
              >
                <option value="" disabled>
                  Elige una opción
                </option>
                {YOUTUBE_PRIVACY_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {YOUTUBE_PRIVACY_LABELS[level]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">¿El video está hecho para niños?</p>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="youtubeMadeForKids" value="no" checked={madeForKids === "no"} onChange={() => setMadeForKids("no")} required className="size-4" />
                  No, no es para niños
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="youtubeMadeForKids" value="yes" checked={madeForKids === "yes"} onChange={() => setMadeForKids("yes")} className="size-4" />
                  Sí, es para niños
                </label>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Al subir a YouTube, aceptas los{" "}
              <a href={YOUTUBE_TERMS_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                Términos del servicio de YouTube
              </a>
              .
            </p>
          </fieldset>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">3. Texto</legend>
        <Label htmlFor="publish-caption" className="sr-only">
          Texto de la publicación
        </Label>
        <textarea
          id="publish-caption"
          name="caption"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          maxLength={CAPTION_LIMIT}
          placeholder="El texto que acompaña al video, con sus hashtags."
          className={textareaClass}
        />
        <p className="text-xs text-muted-foreground">
          {caption.length} / {CAPTION_LIMIT} caracteres
        </p>
        {selectedPlatforms.includes("youtube") ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="publish-youtube-title">Título en YouTube</Label>
            <Input id="publish-youtube-title" name="youtubeTitle" maxLength={TITLE_LIMIT} placeholder="Si lo dejas vacío se usa la primera línea del texto" />
          </div>
        ) : null}
        {selectedPlatforms.length > 1 ? (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Texto distinto por red (opcional)</summary>
            <div className="mt-3 flex flex-col gap-3">
              {selectedPlatforms.map((platform) => (
                <div key={platform} className="flex flex-col gap-1.5">
                  <Label htmlFor={`publish-caption-${platform}`}>{LABELS[platform]}</Label>
                  <textarea id={`publish-caption-${platform}`} name={`caption_${platform}`} maxLength={CAPTION_LIMIT} placeholder="Vacío = el texto general" className={textareaClass} />
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">4. Cuándo</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="when" value="now" checked={when === "now"} onChange={() => setWhen("now")} className="size-4" />
            Ahora
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="when" value="later" checked={when === "later"} onChange={() => setWhen("later")} className="size-4" />
            Programar
          </label>
        </div>
        {when === "later" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="publish-at">Fecha y hora ({timeZoneLabel})</Label>
            <Input id="publish-at" name="scheduledAt" type="datetime-local" min={minScheduledAt} required className="w-fit" />
          </div>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={pending || !video || selected.length === 0 || blocker !== null} className="w-fit">
          {pending ? "Guardando…" : when === "now" ? "Publicar" : "Programar"}
        </Button>
        {blocker && video && selected.length > 0 ? <p className="text-sm text-muted-foreground">{blocker}</p> : null}
        <p aria-live="polite" className={`text-sm ${state?.ok === false ? "text-destructive" : "text-muted-foreground"}`}>
          {state?.message ?? "Con esta página abierta, Metrix publica al instante y muestra en segundos cuando cada red termina; si la cierras, sigue cada minuto y te avisa en Alertas."}
        </p>
      </div>
    </form>
  );
}
