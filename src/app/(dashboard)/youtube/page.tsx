import { Suspense } from "react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { DashboardSkeleton } from "@/components/metrics/dashboard-skeleton";
import { KpiCards } from "@/components/metrics/kpi-cards";
import { Section } from "@/components/metrics/section";
import { ShareBars } from "@/components/metrics/share-bars";
import { TrendChart } from "@/components/metrics/trend-chart";
import { AgeGenderChart } from "@/components/youtube/age-gender-chart";
import { PostTable } from "@/components/metrics/post-table";
import { formatDuration, formatShortDate } from "@/lib/format";
import type { PostColumn, PostFilter, PostTableRow } from "@/lib/metrics/posts";
import type { VideoRow } from "@/lib/metrics/youtube-content";
import { getYouTubeAccount, getYouTubeAudience, getYouTubeOverview, getYouTubeVideos } from "@/lib/metrics/youtube-data";
import { parseRange, RANGE_PARAM } from "@/lib/range";

export const metadata: Metadata = { title: "YouTube · Metrix" };

const CONNECTIONS = { href: "/settings/connections", label: "Ir a Configuración" };

const VIDEO_COLUMNS: PostColumn[] = [
  { key: "views", label: "Vistas", format: "count" },
  { key: "likes", label: "Me gusta", format: "count" },
  { key: "comments", label: "Comentarios", format: "count" },
  { key: "engagement", label: "Engagement", format: "percent" },
];
const VIDEO_FILTERS: PostFilter[] = [
  { key: "video", label: "Videos" },
  { key: "short", label: "Shorts" },
];

function toTableRow(video: VideoRow): PostTableRow {
  return {
    id: video.id,
    title: video.title,
    type: video.type,
    subtitle: `${video.type === "short" ? "Short" : "Video"} · ${formatDuration(video.durationSeconds)}`,
    thumbnailUrl: video.thumbnailUrl,
    publishedAt: video.publishedAt,
    href: `/youtube/videos/${video.id}`,
    external: false,
    values: { views: video.views, likes: video.likes, comments: video.comments, engagement: video.engagement },
  };
}

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
        {videos.length > 0 ? (
          <PostTable
            rows={videos.map(toTableRow)}
            columns={VIDEO_COLUMNS}
            filters={VIDEO_FILTERS}
            itemLabel="videos"
            note="Cifras acumuladas al último sync. Se cuenta como Short todo video de 3 minutos o menos. Engagement = (me gusta + comentarios) / vistas."
          />
        ) : (
          <p className="text-sm text-muted-foreground">Sin videos todavía.</p>
        )}
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
