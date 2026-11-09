import { errorCode, fetchWithRetry, HttpError, type FetchFn, type RetryOptions } from "@/lib/platforms/http";
import { PublishError } from "./types";

/** Instagram/Facebook Reels and TikTok cap uploads well below this; it also protects function memory. */
export const MAX_VIDEO_BYTES = 1_000_000_000;

/**
 * Downloads a Drive file the user picked (drive.file only reaches files the
 * user chose with the Picker, for this app).
 */
export async function downloadDriveFile(fileId: string, accessToken: string, fetchFn: FetchFn = fetch, retry?: RetryOptions): Promise<Uint8Array> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
  const response = await fetchWithRetry(fetchFn, url, { headers: { Authorization: `Bearer ${accessToken}` } }, retry);
  if (!response.ok) {
    const code = await errorCode(response);
    // The caller refreshes the token once and retries.
    if (response.status === 401) throw new HttpError(401, code);
    if (response.status === 404) throw new PublishError("No se encontró el video en Google Drive (¿se borró o se movió a la papelera?).");
    if (response.status === 403) throw new PublishError(`Google Drive no dio acceso al video (${code || "403"}). Elígelo desde Metrix con la misma cuenta que conectaste en Google Drive.`);
    throw new PublishError(`Google Drive respondió ${response.status} ${code}`, response.status >= 500);
  }
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_VIDEO_BYTES) throw new PublishError("El video pesa más de 1 GB.");
  return new Uint8Array(await response.arrayBuffer());
}

export type DriveVideo = { id: string; name: string; mimeType: string; sizeBytes: number | null; modifiedTime: string | null; durationSeconds: number | null };

const FILE_FIELDS = "id,name,mimeType,size,modifiedTime,videoMediaMetadata(durationMillis)";

type DriveFile = { id: string; name?: string; mimeType?: string; size?: string; modifiedTime?: string; videoMediaMetadata?: { durationMillis?: string } };

function toVideo(file: DriveFile): DriveVideo {
  const size = Number(file.size);
  const duration = Number(file.videoMediaMetadata?.durationMillis);
  return {
    id: file.id,
    name: file.name ?? "video",
    mimeType: file.mimeType ?? "",
    sizeBytes: Number.isFinite(size) ? size : null,
    modifiedTime: file.modifiedTime ?? null,
    durationSeconds: Number.isFinite(duration) ? Math.round(duration / 1000) : null,
  };
}

async function driveJson<T>(url: string, accessToken: string, fetchFn: FetchFn): Promise<T> {
  const response = await fetchWithRetry(fetchFn, url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new HttpError(response.status, await errorCode(response));
  return (await response.json()) as T;
}

/**
 * Videos Metrix can reach: with drive.file, only the ones the user picked in
 * the Picker (or that Metrix created), never the rest of the Drive.
 */
export async function listDriveVideos(accessToken: string, fetchFn: FetchFn = fetch, limit = 50): Promise<DriveVideo[]> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", "mimeType contains 'video/' and trashed = false");
  url.searchParams.set("fields", `files(${FILE_FIELDS})`);
  url.searchParams.set("orderBy", "modifiedTime desc");
  url.searchParams.set("pageSize", String(Math.min(limit, 100)));
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  const body = await driveJson<{ files?: DriveFile[] }>(url.toString(), accessToken, fetchFn);
  return (body.files ?? []).map(toVideo);
}

/** Metadata of one file (404 when it is gone or Metrix cannot reach it). */
export async function getDriveVideo(fileId: string, accessToken: string, fetchFn: FetchFn = fetch): Promise<DriveVideo | null> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(FILE_FIELDS)}&supportsAllDrives=true`;
  try {
    return toVideo(await driveJson<DriveFile>(url, accessToken, fetchFn));
  } catch (error) {
    if (error instanceof HttpError && (error.status === 404 || error.status === 403)) return null;
    throw error;
  }
}
