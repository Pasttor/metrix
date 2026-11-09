import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, CircleX, Info } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { listNotifications, NOTIFICATIONS_SHOWN, type Notification } from "@/lib/metrics/notifications-data";
import { markAllNotificationsRead, markNotificationRead } from "./actions";

export const metadata: Metadata = { title: "Alertas · Metrix" };

const SEVERITY = {
  error: { icon: CircleX, label: "Error", tone: "text-red-700 dark:text-red-400" },
  warning: { icon: CircleAlert, label: "Aviso", tone: "text-amber-700 dark:text-amber-400" },
  info: { icon: Info, label: "Evento", tone: "text-sky-700 dark:text-sky-400" },
} as const;

function NotificationItem({ notification }: { notification: Notification }) {
  const meta = SEVERITY[notification.severity];
  const Icon = meta.icon;
  const unread = notification.readAt === null;
  return (
    <li className={`flex gap-3 px-4 py-3 ${unread ? "bg-muted/40" : ""}`}>
      <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${meta.tone}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className={`text-sm ${unread ? "font-semibold" : "font-medium"}`}>{notification.title}</span>
          <span className="text-xs text-muted-foreground">
            {meta.label} · {formatDateTime(notification.createdAt)}
            {unread ? " · sin leer" : ""}
          </span>
        </p>
        <p className="text-sm text-muted-foreground">{notification.message}</p>
        {notification.href ? (
          <Link href={notification.href} className="w-fit text-sm font-medium underline underline-offset-4">
            Ver detalle
          </Link>
        ) : null}
      </div>
      {unread ? (
        <form action={markNotificationRead} className="shrink-0">
          <input type="hidden" name="id" value={notification.id} />
          <Button type="submit" size="sm" variant="ghost">
            Marcar como leída
          </Button>
        </form>
      ) : null}
    </li>
  );
}

async function Notifications() {
  const notifications = await listNotifications();
  if (notifications.length === 0) {
    return <EmptyState message="No hay alertas. Aquí aparecerán los problemas de sincronización, las cuentas por reconectar y los eventos como las métricas finales de tus historias." />;
  }
  const unread = notifications.filter((notification) => notification.readAt === null).length;
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {unread === 0 ? "Todo leído." : `${unread} sin leer.`} Se muestran las últimas {NOTIFICATIONS_SHOWN}.
        </p>
        {unread > 0 ? (
          <form action={markAllNotificationsRead}>
            <Button type="submit" size="sm" variant="outline">
              Marcar todas como leídas
            </Button>
          </form>
        ) : null}
      </div>
      <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
        {notifications.map((notification) => (
          <NotificationItem key={notification.id} notification={notification} />
        ))}
      </ul>
    </>
  );
}

export default function AlertsPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Alertas</h1>
        <p className="text-sm text-muted-foreground">
          Problemas de sincronización, cuentas por reconectar, accesos por caducar y eventos de tus redes. Una alerta del mismo problema aparece
          como máximo una vez al día.
        </p>
      </header>
      {/* Reads the session, so it renders at request time. */}
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Notifications />
      </Suspense>
    </>
  );
}
