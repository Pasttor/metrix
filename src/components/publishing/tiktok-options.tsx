"use client";

import { useEffect } from "react";
import { tiktokCreatorAction, type CreatorInfoResult } from "@/app/(dashboard)/publicar/actions";
import { Label } from "@/components/ui/label";
import {
  TIKTOK_BRANDED_URL,
  TIKTOK_MUSIC_URL,
  TIKTOK_PRIVACY_LABELS,
  TIKTOK_PRIVACY_LEVELS,
  tiktokCommercialLabel,
  type TikTokCreator,
  type TikTokPrivacyLevel,
} from "@/lib/publishing/options";

/**
 * TikTok's required posting UX (Content Sharing Guidelines): the creator's
 * name and avatar from creator_info, a privacy level with no default, the
 * interaction settings unchecked by default (greyed out when the account
 * turned them off), the commercial content disclosure and the consent line.
 */

export type TikTokChoices = {
  privacyLevel: TikTokPrivacyLevel | "";
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  commercial: boolean;
  yourBrand: boolean;
  brandedContent: boolean;
};

export const EMPTY_TIKTOK: TikTokChoices = {
  privacyLevel: "",
  allowComment: false,
  allowDuet: false,
  allowStitch: false,
  commercial: false,
  yourBrand: false,
  brandedContent: false,
};

/** Why the post cannot be sent yet with these TikTok choices (null = ready). */
export function tiktokBlocker(choices: TikTokChoices, creator: CreatorInfoResult | null, durationSec: number | null): string | null {
  if (!creator) return "Consultando tu cuenta de TikTok…";
  if (!creator.ok) return creator.message;
  if (!choices.privacyLevel) return "Elige quién puede ver el video en TikTok.";
  if (choices.commercial && !choices.yourBrand && !choices.brandedContent) return "Indica si el contenido comercial promociona tu marca, a un tercero o ambos.";
  const max = creator.creator.maxDurationSec;
  if (max !== null && durationSec !== null && durationSec > max) return `El video dura ${durationSec} s y tu cuenta de TikTok permite hasta ${max} s.`;
  return null;
}

const selectClass =
  "h-9 w-full max-w-xs rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Check({
  name,
  label,
  checked,
  disabled,
  hint,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  hint?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex items-start gap-2 text-sm ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
      <input type="checkbox" name={name} checked={checked && !disabled} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 size-4" />
      <span className="flex flex-col">
        {label}
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

export function TikTokOptions({
  accountId,
  choices,
  onChange,
  creator,
  onCreator,
}: {
  accountId: string;
  choices: TikTokChoices;
  onChange: (choices: TikTokChoices) => void;
  creator: CreatorInfoResult | null;
  onCreator: (result: CreatorInfoResult | null) => void;
}) {
  // Fresh creator info every time the TikTok account is chosen (the guidelines ask for the latest).
  // The parent clears `creator` when the selection changes; this only fetches.
  useEffect(() => {
    let active = true;
    tiktokCreatorAction(accountId)
      .then((result) => {
        if (active) onCreator(result);
      })
      .catch(() => {
        if (active) onCreator({ ok: false, message: "No se pudo consultar a TikTok. Intenta de nuevo." });
      });
    return () => {
      active = false;
    };
  }, [accountId, onCreator]);

  const set = (patch: Partial<TikTokChoices>) => onChange({ ...choices, ...patch });
  const info: TikTokCreator | null = creator?.ok ? creator.creator : null;
  const allowed = info && info.privacyOptions.length > 0 ? info.privacyOptions : [...TIKTOK_PRIVACY_LEVELS];
  const label = tiktokCommercialLabel(choices);

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-medium">Opciones de TikTok</legend>

      {!creator ? (
        <p className="text-sm text-muted-foreground">Consultando tu cuenta de TikTok…</p>
      ) : !creator.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {creator.message}
        </p>
      ) : (
        <div className="flex items-center gap-3">
          {info?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- TikTok CDN avatar, short-lived signed URL.
            <img src={info.avatarUrl} alt="" className="size-10 rounded-full border object-cover" />
          ) : null}
          <p className="text-sm">
            Publicarás en TikTok como <span className="font-medium">{info?.nickname ?? info?.username ?? "tu cuenta"}</span>
            {info?.username ? <span className="text-muted-foreground"> · @{info.username}</span> : null}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tiktok-privacy">¿Quién puede ver este video?</Label>
        <select
          id="tiktok-privacy"
          name="tiktokPrivacy"
          required
          value={choices.privacyLevel}
          onChange={(event) => set({ privacyLevel: event.target.value as TikTokPrivacyLevel | "" })}
          className={selectClass}
        >
          <option value="" disabled>
            Elige una opción
          </option>
          {allowed.map((level) => {
            const blocked = level === "SELF_ONLY" && choices.commercial && choices.brandedContent;
            return (
              <option key={level} value={level} disabled={blocked}>
                {TIKTOK_PRIVACY_LABELS[level]}
                {blocked ? " (no disponible con contenido de marca)" : ""}
              </option>
            );
          })}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Permitir a los usuarios</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Check
            name="tiktokAllowComment"
            label="Comentar"
            checked={choices.allowComment}
            disabled={info?.commentDisabled}
            hint={info?.commentDisabled ? "Desactivado en tu cuenta de TikTok" : undefined}
            onChange={(checked) => set({ allowComment: checked })}
          />
          <Check
            name="tiktokAllowDuet"
            label="Dúo"
            checked={choices.allowDuet}
            disabled={info?.duetDisabled}
            hint={info?.duetDisabled ? "Desactivado en tu cuenta de TikTok" : undefined}
            onChange={(checked) => set({ allowDuet: checked })}
          />
          <Check
            name="tiktokAllowStitch"
            label="Stitch"
            checked={choices.allowStitch}
            disabled={info?.stitchDisabled}
            hint={info?.stitchDisabled ? "Desactivado en tu cuenta de TikTok" : undefined}
            onChange={(checked) => set({ allowStitch: checked })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            role="switch"
            name="tiktokCommercial"
            checked={choices.commercial}
            onChange={(event) => set({ commercial: event.target.checked, ...(event.target.checked ? {} : { yourBrand: false, brandedContent: false }) })}
            className="mt-0.5 size-4"
          />
          <span className="flex flex-col">
            <span className="font-medium">Divulgar contenido comercial</span>
            <span className="text-xs text-muted-foreground">Actívalo si el video promociona una marca, un producto o un servicio a cambio de algo de valor.</span>
          </span>
        </label>
        {choices.commercial ? (
          <div className="ml-6 flex flex-col gap-2">
            <Check
              name="tiktokYourBrand"
              label="Tu marca"
              hint="Promocionas tu propio negocio o marca."
              checked={choices.yourBrand}
              onChange={(checked) => set({ yourBrand: checked })}
            />
            <Check
              name="tiktokBrandedContent"
              label="Contenido de marca"
              hint={choices.privacyLevel === "SELF_ONLY" ? "El contenido de marca no puede ser «Solo yo». Cambia la privacidad." : "Promocionas a otra marca o a un tercero."}
              checked={choices.brandedContent}
              disabled={choices.privacyLevel === "SELF_ONLY"}
              onChange={(checked) => set({ brandedContent: checked })}
            />
            {label ? <p className="text-xs text-muted-foreground">{label}</p> : null}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Al publicar, aceptas{" "}
        {choices.commercial && choices.brandedContent ? (
          <>
            la{" "}
            <a href={TIKTOK_BRANDED_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              Política de contenido de marca
            </a>{" "}
            y{" "}
          </>
        ) : null}
        la{" "}
        <a href={TIKTOK_MUSIC_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">
          Confirmación de uso de música
        </a>{" "}
        de TikTok. Después de publicar, el video puede tardar unos minutos en aparecer en tu perfil.
      </p>
    </fieldset>
  );
}
