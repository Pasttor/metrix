"use client";

/**
 * Google Picker in the browser. The token comes from Google Identity Services
 * with only `drive.file`: it lets Metrix open the files the user picks here,
 * nothing else in their Drive. The server later downloads the picked file
 * with the YouTube connection (same Google project, same scope).
 */

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export type PickedVideo = { id: string; name: string; mimeType: string; sizeBytes: number | null };

type TokenResponse = { access_token?: string; error?: string };
type PickerDoc = { id: string; name?: string; mimeType?: string; sizeBytes?: number | string };
type PickerData = { action: string; docs?: PickerDoc[] };

type GoogleApi = {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string }) => void;
      }): { requestAccessToken(options?: { prompt?: string }): void };
    };
  };
  picker: {
    Action: { PICKED: string; CANCEL: string };
    ViewId: { DOCS_VIDEOS: string };
    DocsView: new (viewId: string) => { setIncludeFolders(value: boolean): unknown; setMode?(mode: unknown): unknown };
    PickerBuilder: new () => PickerBuilder;
  };
};

type PickerBuilder = {
  addView(view: unknown): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setLocale(locale: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setCallback(callback: (data: PickerData) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
};

type Gapi = { load(name: string, callback: () => void): void };

function globals() {
  return window as unknown as { google?: GoogleApi; gapi?: Gapi };
}

const loading = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const existing = loading.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading.delete(src);
      reject(new Error("No se pudo cargar Google Picker. Revisa tu conexión."));
    };
    document.head.appendChild(script);
  });
  loading.set(src, promise);
  return promise;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function driveToken(clientId: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  const google = globals().google;
  if (!google) throw new Error("Google no cargó.");
  const token = await new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (response) => (response.access_token ? resolve(response.access_token) : reject(new Error("Google no dio acceso a Drive."))),
      error_callback: (error) => reject(new Error(error.type === "popup_closed" ? "Cerraste la ventana de Google." : "Google no dio acceso a Drive.")),
    });
    client.requestAccessToken({ prompt: "" });
  });
  // GIS tokens last an hour; reuse it for a while within this tab only (memory, never storage).
  cachedToken = { value: token, expiresAt: Date.now() + 45 * 60_000 };
  return token;
}

export async function pickDriveVideo(config: { clientId: string; apiKey: string; appId: string }): Promise<PickedVideo | null> {
  await Promise.all([loadScript("https://accounts.google.com/gsi/client"), loadScript("https://apis.google.com/js/api.js")]);
  const { gapi } = globals();
  if (!gapi) throw new Error("Google no cargó.");
  await new Promise<void>((resolve) => gapi.load("picker", resolve));
  const token = await driveToken(config.clientId);
  const google = globals().google!;

  return new Promise<PickedVideo | null>((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS_VIDEOS);
    view.setIncludeFolders(true);
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(config.apiKey)
      .setAppId(config.appId)
      .setLocale("es")
      .setTitle("Elige el video")
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          const doc = data.docs?.[0];
          if (!doc) return resolve(null);
          const size = Number(doc.sizeBytes);
          resolve({ id: doc.id, name: doc.name ?? "video", mimeType: doc.mimeType ?? "", sizeBytes: Number.isFinite(size) ? size : null });
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}
