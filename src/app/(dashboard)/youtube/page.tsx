import { Suspense } from "react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiCards } from "@/components/metrics/kpi-cards";
import { Section } from "@/components/metrics/section";
import { ShareBars } from "@/components/metrics/share-bars";
import { TrendChart } from "@/components/metrics/trend-chart";
import { AgeGenderChart } from "@/components/youtube/age-gender-chart";
import { VideoTable } from "@/components/youtube/video-table";
import { formatShortDate } from "@/lib/format";
import { getYouTubeAccount, getYouTubeAudience, getYouTubeOverview, getYouTubeVideos } from "@/lib/metrics/youtube-data";
import { parseRange, RANGE_PARAM } from "@/lib/range";

export const metadata: Metadata = { title: "YouTube · Metrix" };

const CONNECTIONS = { href: "/settings/connections", label: "Ir a Configuración" };

async function YouTubeDashboard({ searchParams }: { searchParams: PageProps<"/youtube">["searchParams"] }) {
  const range = parseRange((await searchParams)[RANGE_PARAM]);
  const account = await getYouTubeAccount();
  if (!account) {
    return <EmptyState message="Aún no hay datos de YouTube. Conecta tu canal para empezar a guardar historial." action={CONNECTIONS} />;
  }

  const [overview, videos, audience] = await Promise.all([
    getYouTubeOverview(account.id, range),
    getYouTubeVideos(account.id),
    getYouTubeAudience(account.id),
  ]);

  if (!overview.hasData && videos.length === 0) {
    return (
      <EmptyState
        message={`${account.name ?? "Tu canal"} está conectado, pero todavía no hay datos guardados. Usa "Cargar historial" o espera al sync diario.`}
        action={CONNECTIONS}
      />
    );
  }

  const { period } = overview;
  const subscribers = overview.subscribers.map((point) => ({
    date: point.date,
    value: point.value,
    note: point.estimated ? "Estimado con altas y bajas diarias" : undefined,
  }));
  const hasEstimates = overview.subscribers.some((point) => point.estimated && point.value !== null);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        {account.name}
        {account.handle ? ` · @${account.handle}` : ""} · Del {formatShortDate(period.start, true)} al{" "}
        {formatShortDate(period.end, true)}, comparado con los {period.days} días anteriores. YouTube publica las analíticas
        con 2–3 días de retraso.
      </p>

      <KpiCards kpis={overview.kpis} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Suscriptores totales"
          description={hasEstimates ? "Los días antes de conectar el canal se estiman con las altas y bajas diarias." : undefined}
        >
          <TrendChart data={subscribers} label="Suscriptores" />
        </Section>
        <Section title="Vistas diarias">
          <TrendChart data={overview.views} label="Vistas" />
        </Section>
      </div>

      <Section title="Videos" description="Haz clic en un video para ver su crecimiento y su curva de retención.">
        {videos.length > 0 ? <VideoTable videos={videos} /> : <p className="text-sm text-muted-foreground">Sin videos todavía.</p>}
      </Section>

      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Audiencia</h2>
        <p className="text-sm text-muted-foreground">
          {audience.date
            ? `Últimos 28 días al ${formatShortDate(audience.date, true)}. Se actualiza cada lunes.`
            : "Se guarda cada lunes (o al cargar el historial)."}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Edad y género" description="Porcentaje de espectadores con sesión iniciada.">
          <AgeGenderChart rows={audience.ageGender} />
        </Section>
        <Section title="Top 10 países" description="Porcentaje de vistas.">
          <ShareBars rows={audience.countries} />
        </Section>
        <Section title="Dispositivos" description="Porcentaje de vistas.">
          <ShareBars rows={audience.devices} />
        </Section>
        <Section title="Fuentes de tráfico" description="Porcentaje de vistas.">
          <ShareBars rows={audience.trafficSources} />
        </Section>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

export default function YouTubePage({ searchParams }: PageProps<"/youtube">) {
  return (
    <>
      <PageHeader title="YouTube" />
      {/* Reads the range and the session, so it renders at request time. */}
      <Suspense fallback={<DashboardSkeleton />}>
        <YouTubeDashboard searchParams={searchParams} />
      </Suspense>
    </>
  );
}
