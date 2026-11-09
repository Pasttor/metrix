import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/dashboard/empty-state";
import { CompetitorTable } from "@/components/metrics/competitor-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { DashboardSkeleton } from "@/components/metrics/dashboard-skeleton";
import { KpiCards } from "@/components/metrics/kpi-cards";
import { PostTable } from "@/components/metrics/post-table";
import { Section } from "@/components/metrics/section";
import { ShareBars } from "@/components/metrics/share-bars";
import { TrendChart } from "@/components/metrics/trend-chart";
import { formatShortDate } from "@/lib/format";
import { getInstagramDashboard } from "@/lib/metrics/meta-data";
import type { PostColumn, PostFilter } from "@/lib/metrics/posts";
import { parseRange, RANGE_PARAM } from "@/lib/range";

export const metadata: Metadata = { title: "Instagram · Metrix" };

const CONNECTIONS = { href: "/settings/connections", label: "Ir a Configuración" };

const COLUMNS: PostColumn[] = [
  { key: "views", label: "Vistas", format: "count" },
  { key: "reach", label: "Alcance", format: "count" },
  { key: "likes", label: "Me gusta", format: "count" },
  { key: "comments", label: "Comentarios", format: "count" },
  { key: "saved", label: "Guardados", format: "count" },
  { key: "shares", label: "Compartidos", format: "count" },
  { key: "engagement", label: "Engagement", format: "percent" },
];
const FILTERS: PostFilter[] = [
  { key: "reel", label: "Reels" },
  { key: "carousel", label: "Carruseles" },
  { key: "image", label: "Imágenes" },
  { key: "video", label: "Videos" },
  { key: "story", label: "Historias" },
];

async function InstagramDashboard({ searchParams }: { searchParams: PageProps<"/instagram">["searchParams"] }) {
  const range = parseRange((await searchParams)[RANGE_PARAM]);
  const data = await getInstagramDashboard(range);
  if (!data) {
    return <EmptyState message="Aún no hay datos de Instagram. Conecta tu cuenta para empezar a guardar historial." action={CONNECTIONS} />;
  }
  if (!data.hasData) {
    return (
      <EmptyState
        message={`@${data.account.handle ?? data.account.name ?? "Tu cuenta"} está conectada, pero todavía no hay datos guardados. Usa "Cargar historial" o espera al sync diario.`}
        action={CONNECTIONS}
      />
    );
  }

  const { period, demographics } = data;
  const noDemographics = demographics.age.length + demographics.gender.length + demographics.countries.length + demographics.cities.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        @{data.account.handle ?? data.account.name} · Del {formatShortDate(period.start, true)} al {formatShortDate(period.end, true)}, comparado con
        los {period.days} días anteriores. Instagram entrega las métricas con hasta 48 h de retraso.
      </p>
      <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        El historial empieza el {formatShortDate(data.historyStart, true)}: Instagram solo guarda 90 días antes de la fecha en que conectaste la cuenta.
      </p>

      <KpiCards kpis={data.kpis} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Seguidores por día" description="Total de seguidores de cada día; se guarda desde que conectaste la cuenta.">
          <TrendChart data={data.followers} label="Seguidores" />
        </Section>
        <Section title="Vistas diarias">
          <TrendChart data={data.charts.views} label="Vistas" />
        </Section>
        <Section title="Alcance diario" description="Cuentas únicas que vieron contenido ese día." className="lg:col-span-2">
          <TrendChart data={data.charts.secondary} label="Alcance" />
        </Section>
      </div>

{data.breakdowns.some((breakdown) => breakdown.rows.length > 0) ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.breakdowns.map((breakdown) => (
            <Section key={breakdown.title} title={breakdown.title} description={breakdown.description}>
              <ShareBars rows={breakdown.rows} valueLabel="cuentas" />
            </Section>
          ))}
        </div>
      ) : null}

      <Section title="Publicaciones" description="Haz clic en una publicación para ver su crecimiento y sus métricas completas.">
        {data.posts.length > 0 ? (
          <PostTable
            rows={data.posts}
            columns={COLUMNS}
            filters={FILTERS}
            note="Cifras acumuladas al último sync. Engagement = interacciones / alcance."
          />
        ) : (
          <p className="text-sm text-muted-foreground">Sin publicaciones todavía.</p>
        )}
      </Section>

      <Section
        title="Competencia"
        description="Tu cuenta junto a las cuentas que sigues (datos públicos). Me gusta y comentarios promedio de las últimas 12 publicaciones."
      >
        {data.competitors.length > 1 ? (
          <CompetitorTable rows={data.competitors} />
        ) : (
          <p className="text-sm text-muted-foreground">Agrega cuentas de tu nicho para compararte con ellas.</p>
        )}
        <Link href="/settings/competitors" className="w-fit text-sm font-medium underline underline-offset-4">
          Administrar competidores
        </Link>
      </Section>

      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Demografía de seguidores</h2>
        <p className="text-sm text-muted-foreground">
          {data.audienceDate
            ? `Últimos 30 días al ${formatShortDate(data.audienceDate, true)}. Se actualiza cada lunes.`
            : "Se guarda cada lunes (o al cargar el historial)."}
        </p>
      </div>
      {noDemographics ? (
        <EmptyState message="Instagram solo comparte la demografía de cuentas con 100 seguidores o más. Aparecerá aquí cuando llegues a esa cifra." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Edad" description="Porcentaje de seguidores.">
            <ShareBars rows={demographics.age} valueLabel="seguidores" />
          </Section>
          <Section title="Género" description="Porcentaje de seguidores.">
            <ShareBars rows={demographics.gender} valueLabel="seguidores" />
          </Section>
          <Section title="Top 10 países" description="Porcentaje de seguidores.">
            <ShareBars rows={demographics.countries} valueLabel="seguidores" />
          </Section>
          <Section title="Top 10 ciudades" description="Porcentaje de seguidores.">
            <ShareBars rows={demographics.cities} valueLabel="seguidores" />
          </Section>
        </div>
      )}
    </div>
  );
}

export default function InstagramPage({ searchParams }: PageProps<"/instagram">) {
  return (
    <>
      <PageHeader title="Instagram" />
      {/* Reads the range and the session, so it renders at request time. */}
      <Suspense fallback={<DashboardSkeleton />}>
        <InstagramDashboard searchParams={searchParams} />
      </Suspense>
    </>
  );
}
