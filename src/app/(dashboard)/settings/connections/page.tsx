import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountSyncActions } from "@/components/connections/account-sync-actions";
import { ConnectionCard } from "@/components/connections/connection-card";
import { ConnectionNotice } from "@/components/connections/connection-notice";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { listConnectionCards } from "@/lib/connections";
import { getEnv } from "@/lib/env";
import { hasSyncer } from "@/lib/sync/registry";

export const metadata: Metadata = { title: "Conexiones · Metrix" };

// Applies to this page's Server Actions ("Sincronizar ahora").
export const maxDuration = 60;

async function ConnectionCards() {
  const cards = await listConnectionCards();
  const timeZone = getEnv().REPORT_TIMEZONE;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {cards.map((card) => {
        const syncAvailable = hasSyncer(card.connectPlatform);
        return (
          <ConnectionCard
            key={card.platform}
            card={card}
            timeZone={timeZone}
            accountActions={(accountId) => {
              const active = card.accounts.find((account) => account.id === accountId)?.status === "active";
              return <AccountSyncActions accountId={accountId} enabled={syncAvailable && active} />;
            }}
          />
        );
      })}
    </div>
  );
}

function CardsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}

export default function ConnectionsPage() {
  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Conexiones</h1>
          <p className="text-sm text-muted-foreground">Cuentas conectadas y estado de la sincronización</p>
        </div>
        <SettingsTabs active="/settings/connections" />
      </header>
      <Suspense fallback={null}>
        <ConnectionNotice />
      </Suspense>
      {/* Reads the session and the accounts, so it renders at request time. */}
      <Suspense fallback={<CardsSkeleton />}>
        <ConnectionCards />
      </Suspense>
    </>
  );
}
