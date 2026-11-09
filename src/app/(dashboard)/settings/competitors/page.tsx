import { Suspense } from "react";
import type { Metadata } from "next";
import { CompetitorTable } from "@/components/metrics/competitor-table";
import { Section } from "@/components/metrics/section";
import { AddCompetitorForm } from "@/components/settings/add-competitor-form";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { Button } from "@/components/ui/button";
import { MAX_COMPETITORS } from "@/lib/competitors";
import { getCompetitorComparison } from "@/lib/metrics/competitors-data";
import { removeCompetitorAction } from "./actions";

export const metadata: Metadata = { title: "Competencia · Metrix" };

async function CompetitorList() {
  const rows = await getCompetitorComparison();
  const competitors = rows.filter((row) => !row.isOwn);
  if (competitors.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no sigues ninguna cuenta. Agrega la primera arriba.</p>;
  }
  return (
    <CompetitorTable
      rows={rows}
      actions={(row) =>
        row.id ? (
          <form action={removeCompetitorAction}>
            <input type="hidden" name="id" value={row.id} />
            <Button type="submit" size="sm" variant="ghost">
              Quitar
            </Button>
          </form>
        ) : null
      }
    />
  );
}

export default function CompetitorsPage() {
  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Competencia</h1>
          <p className="text-sm text-muted-foreground">
            Cuentas de Instagram para comparar contra la tuya. Se actualizan en cada sync diario (hasta {MAX_COMPETITORS}).
          </p>
        </div>
        <SettingsTabs active="/settings/competitors" />
      </header>
      <Section title="Agregar cuenta">
        <AddCompetitorForm />
      </Section>
      <Section title="Cuentas que sigues" description="Me gusta y comentarios promedio de sus últimas 12 publicaciones. Engagement = (me gusta + comentarios) / seguidores.">
        {/* Reads the session, so it renders at request time. */}
        <Suspense fallback={<div className="h-32 animate-pulse rounded-lg bg-muted" />}>
          <CompetitorList />
        </Suspense>
      </Section>
    </>
  );
}
