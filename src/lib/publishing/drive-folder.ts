import "server-only";
import { createAdminClient } from "@/lib/db/admin";

/**
 * The Drive folder the Picker opens by default (where the user keeps the
 * videos to publish). Stored in app_config, which only the server reads.
 */

export type DriveFolder = { id: string; name: string };

const ID_KEY = "drive_folder_id";
const NAME_KEY = "drive_folder_name";
export const DRIVE_ID_PATTERN = /^[\w-]{10,200}$/;

export async function getDriveFolder(): Promise<DriveFolder | null> {
  const { data, error } = await createAdminClient().from("app_config").select("key, value").in("key", [ID_KEY, NAME_KEY]);
  if (error) return null;
  const id = data.find((row) => row.key === ID_KEY)?.value;
  const name = data.find((row) => row.key === NAME_KEY)?.value;
  return id && DRIVE_ID_PATTERN.test(id) ? { id, name: name || "Carpeta de videos" } : null;
}

export async function saveDriveFolder(folder: DriveFolder | null): Promise<boolean> {
  const db = createAdminClient();
  if (!folder) {
    const { error } = await db.from("app_config").delete().in("key", [ID_KEY, NAME_KEY]);
    return !error;
  }
  const now = new Date().toISOString();
  const { error } = await db.from("app_config").upsert(
    [
      { key: ID_KEY, value: folder.id, updated_at: now },
      { key: NAME_KEY, value: folder.name.slice(0, 200), updated_at: now },
    ],
    { onConflict: "key" },
  );
  return !error;
}
