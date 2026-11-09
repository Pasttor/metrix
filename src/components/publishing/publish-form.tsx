"use client";

import { useActionState, useState } from "react";
import { FolderOpen } from "lucide-react";
import { schedulePostAction } from "@/app/(dashboard)/publicar/actions";
import { NetworkIcon } from "@/components/overview/network-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CAPTION_LIMIT, TITLE_LIMIT, type PublishAccount } from "@/lib/publishing/scheduling";
import type { PublishPlatform } from "@/lib/publishing/types";
import { pickDriveVideo, type PickedVideo } from "./drive-picker";

export type PickerConfig = { clientId: string; apiKey: string; appId: string; loginHint?: string };

const LABELS: Record<PublishPlatform, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok" };
const LIMITS: Partial<Record<PublishPlatform, string>> = {
  youtube: "Se sube como privado hasta que Google audite la app.",
  tiktok: "Se publica como «Solo yo» hasta que TikTok audite la app.",
  instagram: "Se publica como Reel.",
  facebook: "Se publica como Reel de la página.",
};

function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  return bytes >= 1_000_000_000 ? `${(bytes / 1_000_000_000).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
}

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

  const [state, action, pending] = useActionState(async (previous: Awaited<ReturnType<typeof schedulePostAction>> | null, formData: FormData) => {
    const result = await schedulePostAction(previous, formData);
    if (result.ok) {
      // Start a clean form for the next post.
      setVideo(null);
      setSelected([]);
      setCaption("");
      setWhen("now");
      setFormKey((key) => key + 1);
    }
    return result;
  }, null);

  const selectedPlatforms = accounts.filter((account) => selected.includes(account.id)).map((account) => account.platform);

  async function choose() {
    if (!picker) return;
    setPickError(null);
    setPicking(true);
    try {
      const picked = await pickDriveVideo(picker);
      if (picked && !picked.mimeType.startsWith("video/")) setPickError("Ese archivo no es un video.");
      else if (picked) setVideo(picked);
    } catch (error) {
      setPickError(error instanceof Error ? error.message : "No se pudo abrir Google Drive.");
    } finally {
      setPicking(false);
    }
  }

  function toggle(account: PublishAccount, checked: boolean) {
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
                <span className="font-medium">{video.name}</span>
                <span className="text-muted-foreground"> · {formatSize(video.sizeBytes)}</span>
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
        <Button type="submit" disabled={pending || !video || selected.length === 0} className="w-fit">
          {pending ? "Guardando…" : when === "now" ? "Publicar" : "Programar"}
        </Button>
        <p aria-live="polite" className={`text-sm ${state?.ok === false ? "text-destructive" : "text-muted-foreground"}`}>
          {state?.message ?? "Metrix revisa la cola cada 5 minutos y te avisa en Alertas cuando cada red termina."}
        </p>
      </div>
    </form>
  );
}
