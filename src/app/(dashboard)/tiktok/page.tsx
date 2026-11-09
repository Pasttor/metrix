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
import type { PostColumn } from "@/lib/metrics/posts";
import { getTikTokDashboard } from "@/lib/metrics/tiktok-data";
import { parseRange, RANGE_PARAM } from "@/lib/range";

export const metadata: Metadata = { title: "TikTok · Metrix" };

const CONNECTIONS = { href: "/settings/connections", label: "Ir a Configuración" };

const COLUMNS: PostColumn[] = [
  { key: "views", label: "Vistas", format: "count" },
  { key: "gained", label: "Vistas nuevas", format: "count" },
  { key: "likes", label: "Likes", format: "count" },
  { key: "comments", label: "Comentarios", format: "count" },
  { key: "shares", label: "Compartidos", format: "count" },
  { key: "engagement", label: "Engagement", format: "percent" },
];

async function TikTokDashboard({ searchParams }: { searchParams: PageProps<"/tiktok">["searchParams"] }) {
  const range = parseRange((await searchParams)[RANGE_PARAM]);
  const data = await getTikTokDashboard(range);
  if (!data) {
    return <EmptyState message="Aún no hay datos de TikTok. Conecta tu cuenta para empezar a guardar historial." action={CONNECTIONS} />;
  }
  const { period } = data;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        @{data.account.handle ?? data.account.name} · Del {formatShortDate(period.start, true)} al {formatShortDate(period.end, true)}, comparado con
        los {period.days} días anteriores.
      </p>
      <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        TikTok no entrega tiempo de visualización ni audiencia para cuentas personales, ni historial: Metrix guarda una foto diaria desde que
        conectaste la cuenta ({data.snapshotDays} día(s) hasta hoy). Las cifras «nuevas» son la diferencia entre fotos y necesitan al menos dos días.
      </p>

      <KpiCards kpis={data.kpis} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Seguidores por día">
          <TrendChart data={data.followers} label="Seguidores" />
        </Section>
        <Section title="Likes totales por día" description="Likes acumulados de la cuenta en cada foto diaria.">
          <TrendChart data={data.likes} label="Likes" />
        </Section>
      </div>

      <Section title="Videos" description="Haz clic en un video para ver cuántas vistas gana cada día.">
        {data.videos.length > 0 ? (
          <PostTable
            rows={data.videos}
            columns={COLUMNS}
            filters={[]}
            itemLabel="videos"
            note="Cifras acumuladas al último sync. Vistas nuevas = vistas ganadas en el periodo. Engagement = (likes + comentarios + compartidos) / vistas."
          />
        ) : (
          <p className="text-sm text-muted-foreground">Sin videos todavía.</p>
        )}
      </Section>
    </div>
  );
}

export default function TikTokPage({ searchParams }: PageProps<"/tiktok">) {
  return (
    <>
      <PageHeader title="TikTok" />
      {/* Reads the range and the session, so it renders at request time. */}
      <Suspense fallback={<DashboardSkeleton />}>
        <TikTokDashboard searchParams={searchParams} />
      </Suspense>
    </>
  );
}
