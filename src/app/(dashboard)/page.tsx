import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { DashboardSkeleton } from "@/components/metrics/dashboard-skeleton";
import { Section } from "@/components/metrics/section";
import { FollowersComparisonChart } from "@/components/overview/followers-comparison-chart";
import { NetworkSummary } from "@/components/overview/network-summary";
import { PostingHeatmap } from "@/components/overview/posting-heatmap";
import { TopPosts } from "@/components/overview/top-posts";
import { MIN_HEATMAP_POSTS } from "@/lib/metrics/unified";
import { getOverview, MIN_VIEWS_FOR_ENGAGEMENT } from "@/lib/metrics/unified-data";
import { parseRange, RANGE_PARAM } from "@/lib/range";

export const metadata: Metadata = { title: "Resumen · Metrix" };

async function Overview({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const range = parseRange((await searchParams)[RANGE_PARAM]);
  const overview = await getOverview(range);
  const connected = overview.networks.flatMap((network) => (network.connected ? [network] : []));

  return (
    <div className="flex flex-col gap-6">
      <NetworkSummary networks={overview.networks} />
      <p className="-mt-3 text-xs text-muted-foreground">
        Vistas y engagement del periodo contra el periodo anterior; cada red termina su periodo en su último día con datos. Engagement =
        interacciones / vistas.
      </p>

      {connected.length > 0 ? (
        <Section title="Seguidores de todas las redes">
          <FollowersComparisonChart series={connected.map((network) => ({ platform: network.platform, label: network.label, points: network.followers }))} />
        </Section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Top 10 por vistas" description="Todas las redes, cifras acumuladas al último sync.">
          <TopPosts posts={overview.topByViews} empty="Todavía no hay publicaciones con vistas." />
        </Section>
        <Section title="Top 10 por engagement" description={`Publicaciones con al menos ${MIN_VIEWS_FOR_ENGAGEMENT} vistas.`}>
          <TopPosts posts={overview.topByEngagement} empty="Todavía no hay publicaciones con suficientes vistas." />
        </Section>
      </div>

      <Section title="Mejores horas para publicar" description={`Engagement medio por día y hora de publicación (${overview.heatmap.posts} publicaciones con métricas).`}>
        <PostingHeatmap heatmaps={{ all: overview.heatmap.all, ...overview.heatmap.byNetwork }} minPosts={MIN_HEATMAP_POSTS} />
      </Section>
    </div>
  );
}

export default function OverviewPage({ searchParams }: PageProps<"/">) {
  return (
    <>
      <PageHeader title="Resumen" description="Todas tus redes" />
      {/* Reads the range and the session, so it renders at request time. */}
      <Suspense fallback={<DashboardSkeleton />}>
        <Overview searchParams={searchParams} />
      </Suspense>
    </>
  );
}
