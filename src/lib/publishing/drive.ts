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
    if (response.status === 403) throw new PublishError(`Google Drive no dio acceso al video (${code || "403"}). Vuelve a elegirlo desde Metrix.`);
    throw new PublishError(`Google Drive respondió ${response.status} ${code}`, response.status >= 500);
  }
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_VIDEO_BYTES) throw new PublishError("El video pesa más de 1 GB.");
  return new Uint8Array(await response.arrayBuffer());
}
