import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConnectionCardData, ConnectionStatus } from "@/lib/connections";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS: Record<ConnectionStatus, { label: string; className: string }> = {
  disconnected: { label: "Sin conectar", className: "bg-muted text-muted-foreground" },
  connected: { label: "Conectada", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  reauth_required: { label: "Reconectar", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
};

const CREDENTIALS_HINT: Record<ConnectionCardData["connectPlatform"], string> = {
  youtube: "Falta configurar la app de Google (GOOGLE_CLIENT_ID).",
  meta: "Falta configurar la app de Meta (META_APP_ID).",
  tiktok: "Falta configurar la app de TikTok (TIKTOK_CLIENT_KEY).",
};

export function ConnectionCard({
  card,
  timeZone,
  accountActions,
}: {
  card: ConnectionCardData;
  timeZone: string;
  /** Extra controls per connected account (sync buttons, T04). */
  accountActions?: (accountId: string) => ReactNode;
}) {
  const status = STATUS[card.status];
  const actionLabel = card.status === "disconnected" ? "Conectar" : "Reconectar";
  const viaMeta = card.connectPlatform === "meta";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle>{card.label}</CardTitle>
          <CardDescription>
            {card.lastSyncedAt ? `Último sync: ${formatDateTime(card.lastSyncedAt, timeZone)}` : "Sin sincronizar todavía"}
          </CardDescription>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium", status.className)}>
          {status.label}
        </span>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {card.accounts.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {card.accounts.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {account.name ?? account.handle ?? "Cuenta"}
                  {account.handle && account.name ? (
                    <span className="text-muted-foreground"> · @{account.handle}</span>
                  ) : null}
                </span>
                {accountActions?.(account.id)}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {card.configured ? (
            // Full navigation: the route redirects to the provider's consent screen.
            <a
              href={`/api/connect/${card.connectPlatform}`}
              className={buttonVariants({ variant: card.status === "connected" ? "outline" : "default", size: "sm" })}
            >
              {actionLabel}
            </a>
          ) : (
            <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")} aria-disabled="true">
              {actionLabel}
            </span>
          )}
          {!card.configured ? (
            <span className="text-xs text-muted-foreground">{CREDENTIALS_HINT[card.connectPlatform]}</span>
          ) : viaMeta ? (
            <span className="text-xs text-muted-foreground">Se conecta junto con la otra cuenta de Meta.</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
