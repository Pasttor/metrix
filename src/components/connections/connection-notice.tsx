"use client";

import { useSearchParams } from "next/navigation";

const PLATFORM_LABEL: Record<string, string> = { youtube: "YouTube", meta: "Meta", tiktok: "TikTok" };

const ERRORS: Record<string, (platform: string) => string> = {
  not_configured: (p) => `Falta configurar las credenciales de ${p}.`,
  denied: (p) => `No se dio permiso en ${p}. Vuelve a intentarlo si fue un error.`,
  state: () => "La solicitud caducó o no es válida. Vuelve a intentarlo.",
  missing_code: (p) => `${p} no devolvió un código de autorización.`,
  no_accounts: (p) => `${p} no devolvió ninguna cuenta para conectar.`,
  callback_failed: (p) => `No se pudo completar la conexión con ${p}.`,
  token_exchange_failed: (p) => `${p} rechazó el código de autorización. Vuelve a intentarlo.`,
  no_refresh_token: () =>
    "Google no entregó un token de actualización. Quita el acceso de Metrix en myaccount.google.com/connections y vuelve a conectar.",
  missing_scopes: (p) => `Faltan permisos de ${p}. Al conectar, deja marcadas todas las casillas de acceso que pide Metrix.`,
  no_channel: () => "Esa cuenta de Google no tiene canal de YouTube. Conecta con la cuenta o cuenta de marca del canal.",
  no_pages: () =>
    "Meta no devolvió ninguna Página. Al conectar, elige tu Página de Facebook (y su cuenta de Instagram) en la ventana de Meta.",
  accounts_lookup_failed: () => "Se obtuvo el permiso, pero no se pudieron leer tus Páginas de Facebook. Vuelve a intentarlo.",
  channel_lookup_failed: () => "Se obtuvo el permiso, pero no se pudo leer el canal de YouTube. Vuelve a intentarlo.",
};

export function ConnectionNotice() {
  const params = useSearchParams();
  const platform = PLATFORM_LABEL[params.get("platform") ?? params.get("connected") ?? ""] ?? "la plataforma";

  const connected = params.get("connected");
  if (connected) {
    return (
      <p role="status" className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
        {platform} quedó conectada.
      </p>
    );
  }

  const error = params.get("error");
  if (!error) return null;
  const message = ERRORS[error]?.(platform) ?? `No se pudo conectar ${platform} (${error}).`;
  return (
    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}
