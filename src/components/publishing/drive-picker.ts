"use client";

/**
 * Google Picker in the browser. The token comes from Google Identity Services
 * with only `drive.file`: it lets Metrix open the files the user picks here,
 * nothing else in their Drive. The server later downloads the picked file
 * with the Google Drive connection (same Google project, same account).
 */

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export type PickedVideo = { id: string; name: string; mimeType: string; sizeBytes: number | null };
export type DriveFolder = { id: string; name: string };
export type PickerOptions = { clientId: string; apiKey: string; appId: string; loginHint?: string; folder?: DriveFolder | null };

const FOLDER_MIME = "application/vnd.google-apps.folder";

type TokenResponse = { access_token?: string; error?: string };
type PickerDoc = { id: string; name?: string; mimeType?: string; sizeBytes?: number | string };
type PickerData = { action: string; docs?: PickerDoc[] };

type GoogleApi = {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        login_hint?: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string }) => void;
      }): { requestAccessToken(options?: { prompt?: string }): void };
    };
  };
  picker: {
    Action: { PICKED: string; CANCEL: string };
    ViewId: { DOCS_VIDEOS: string; FOLDERS: string };
    DocsView: new (viewId: string) => DocsView;
    PickerBuilder: new () => PickerBuilder;
  };
};

type DocsView = {
  setIncludeFolders(value: boolean): DocsView;
  setSelectFolderEnabled(value: boolean): DocsView;
  setMimeTypes(mimeTypes: string): DocsView;
  setOwnedByMe(value: boolean): DocsView;
  setParent(folderId: string): DocsView;
  setLabel(label: string): DocsView;
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

async function driveToken(clientId: string, loginHint?: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  const google = globals().google;
  if (!google) throw new Error("Google no cargó.");
  const token = await new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_FILE_SCOPE,
      login_hint: loginHint,
      callback: (response) => (response.access_token ? resolve(response.access_token) : reject(new Error("Google no dio acceso a Drive."))),
      error_callback: (error) => reject(new Error(error.type === "popup_closed" ? "Cerraste la ventana de Google." : "Google no dio acceso a Drive.")),
    });
    client.requestAccessToken({ prompt: "" });
  });
  // GIS tokens last an hour; reuse it for a while within this tab only (memory, never storage).
  cachedToken = { value: token, expiresAt: Date.now() + 45 * 60_000 };
  return token;
}

async function openPicker(config: PickerOptions): Promise<{ google: GoogleApi; token: string }> {
  await Promise.all([loadScript("https://accounts.google.com/gsi/client"), loadScript("https://apis.google.com/js/api.js")]);
  const { gapi } = globals();
  if (!gapi) throw new Error("Google no cargó.");
  await new Promise<void>((resolve) => gapi.load("picker", resolve));
  const token = await driveToken(config.clientId, config.loginHint);
  return { google: globals().google!, token };
}

/**
 * Opens the Picker on the saved videos folder (with its subfolders), plus a
 * "Todo mi Drive" tab with the user's own videos for one kept somewhere else.
 */
export async function pickDriveVideo(config: PickerOptions): Promise<PickedVideo | null> {
  const { google, token } = await openPicker(config);

  return new Promise<PickedVideo | null>((resolve) => {
    const views: DocsView[] = [];
    if (config.folder) {
      views.push(new google.picker.DocsView(google.picker.ViewId.DOCS_VIDEOS).setParent(config.folder.id).setIncludeFolders(true).setLabel(config.folder.name));
    }
    // Only the user's own videos (no "shared with me"); setOwnedByMe is ignored together with setIncludeFolders.
    views.push(new google.picker.DocsView(google.picker.ViewId.DOCS_VIDEOS).setOwnedByMe(true).setLabel(config.folder ? "Todo mi Drive" : "Mis videos"));
    let builder = new google.picker.PickerBuilder();
    for (const view of views) builder = builder.addView(view);
    const picker = builder
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

/** Lets the user choose the folder where the videos live; the Picker opens there from then on. */
export async function pickDriveFolder(config: PickerOptions): Promise<DriveFolder | null> {
  const { google, token } = await openPicker(config);

  return new Promise<DriveFolder | null>((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes(FOLDER_MIME).setLabel("Carpetas");
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(config.apiKey)
      .setAppId(config.appId)
      .setLocale("es")
      .setTitle("Elige la carpeta donde guardas tus videos")
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          const doc = data.docs?.[0];
          resolve(doc && doc.mimeType === FOLDER_MIME ? { id: doc.id, name: doc.name ?? "Carpeta de videos" } : null);
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}
