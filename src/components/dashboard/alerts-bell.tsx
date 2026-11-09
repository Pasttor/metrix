import Link from "next/link";
import { Bell } from "lucide-react";
import { unreadNotificationCount } from "@/lib/metrics/notifications-data";

/** Header bell with the number of unread alerts; links to /alertas. */
export async function AlertsBell() {
  const unread = await unreadNotificationCount();
  const label = unread === 0 ? "Alertas, ninguna sin leer" : `Alertas, ${unread} sin leer`;
  return (
    <Link href="/alertas" aria-label={label} title={label} className="relative inline-flex size-9 items-center justify-center rounded-md hover:bg-muted">
      <Bell aria-hidden className="size-4" />
      {unread > 0 ? (
        <span className="absolute top-1 right-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] leading-4 font-semibold text-white tabular-nums">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}

export function AlertsBellFallback() {
  return (
    <span className="inline-flex size-9 items-center justify-center text-muted-foreground" aria-hidden>
      <Bell className="size-4" />
    </span>
  );
}
