import "server-only";
import { createClient } from "@/lib/db/server";
import { fail } from "./data";

/** In-app alerts and events, read with the user's session (RLS). */

export const NOTIFICATIONS_SHOWN = 100;

export type Notification = {
  id: string;
  kind: string;
  severity: "info" | "warning" | "error";
  title: string;
  message: string;
  href: string | null;
  createdAt: string;
  readAt: string | null;
};

export async function listNotifications(): Promise<Notification[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("notifications")
    .select("id, kind, severity, title, message, href, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(NOTIFICATIONS_SHOWN);
  if (error) fail("notifications.list", error);
  return data.map((row) => ({
    id: row.id,
    kind: row.kind,
    severity: (["info", "warning", "error"].includes(row.severity) ? row.severity : "info") as Notification["severity"],
    title: row.title,
    message: row.message,
    href: row.href,
    createdAt: row.created_at,
    readAt: row.read_at,
  }));
}

export async function unreadNotificationCount(): Promise<number> {
  const db = await createClient();
  const { count, error } = await db.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  if (error) fail("notifications.unread", error);
  return count ?? 0;
}
