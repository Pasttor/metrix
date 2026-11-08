import { Suspense } from "react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { DashboardSkeleton } from "@/components/metrics/dashboard-skeleton";
import { KpiCards } from "@/components/metrics/kpi-cards";
import { PostTable } from "@/components/metrics/post-table";
import { Section } from "@/components/metrics/section";
import { TrendChart } from "@/components/metrics/trend-chart";
import { formatShortDate } from "@/lib/format";
import { getFacebookDashboard } from "@/lib/metrics/meta-data";
import type { PostColumn, PostFilter } from "@/lib/metrics/posts";
import { parseRange, RANGE_PARAM } from "@/lib/range";

export const metadata: Metadata = { title: "Facebook · Metrix" };

const CONNECTIONS = { href: "/settings/connections", label: "Ir a Configuración" };

const COLUMNS: PostColumn[] = [
  { key: "post_media_view", label: "Vistas", format: "count" },
  { key: "post_total_media_view_unique", label: "Espectadores", format: "count" },
  { key: "reactions", label: "Reacciones", format: "count" },
  { key: "comments", label: "Comentarios", format: "count" },
  { key: "shares", label: "Compartidos", format: "count" },
  { key: "post_clicks", label: "Clics", format: "count" },
  { key: "post_video_views", label: "Reproducciones", format: "count" },
];
const FILTERS: PostFilter[] = [
  { key: "reel", label: "Reels" },
  { key: "video", label: "Videos" },
  { key: "image", label: "Fotos" },
  { key: "carousel", label: "Álbumes" },
  { key: "post", label: "Texto y enlaces" },
];

async function FacebookDashboard({ searchParams }: { searchParams: PageProps<"/facebook">["searchParams"] }) {
  const range = parseRange((await searchParams)[RANGE_PARAM]);
  const data = await getFacebookDashboard(range);
  if (!data) {
    return <EmptyState message="Aún no hay datos de Facebook. Conecta tu Página para empezar a guardar historial." action={CONNECTIONS} />;
  }
  if (!data.hasData) {
    return (
      <EmptyState
        message={`${data.account.name ?? "Tu Página"} está conectada, pero todavía no hay datos guardados. Usa "Cargar historial" o espera al sync diario.`}
        action={CONNECTIONS}
      />
    );
  }

  const { period } = data;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        {data.account.name} · Del {formatShortDate(period.start, true)} al {formatShortDate(period.end, true)}, comparado con los {period.days} días
        anteriores. Meta entrega las métricas de la Página con hasta 48 h de retraso.
      </p>

      <KpiCards kpis={data.kpis} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Espectadores únicos por día" description="Personas que vieron contenido de la Página ese día.">
          <TrendChart data={data.charts.views} label="Espectadores" />
        </Section>
        <Section title="Reproducciones de video por día">
          <TrendChart data={data.charts.secondary} label="Reproducciones" />
        </Section>
        <Section title="Seguidores por día" description="Total de seguidores de cada día; se guarda desde que conectaste la Página." className="lg:col-span-2">
          <TrendChart data={data.followers} label="Seguidores" />
        </Section>
      </div>

      <Section title="Publicaciones" description="Haz clic en una publicación para abrirla en Facebook.">
        {data.posts.length > 0 ? (
          <PostTable
            rows={data.posts}
            columns={COLUMNS}
            filters={FILTERS}
            note="Cifras acumuladas al último sync. Reproducciones = vistas de video de 3 segundos o más."
          />
        ) : (
          <p className="text-sm text-muted-foreground">Sin publicaciones todavía.</p>
        )}
      </Section>
    </div>
  );
}

export default function FacebookPage({ searchParams }: PageProps<"/facebook">) {
  return (
    <>
      <PageHeader title="Facebook" />
      {/* Reads the range and the session, so it renders at request time. */}
      <Suspense fallback={<DashboardSkeleton />}>
        <FacebookDashboard searchParams={searchParams} />
      </Suspense>
    </>
  );
}
