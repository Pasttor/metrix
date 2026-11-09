import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Section } from "@/components/metrics/section";
import { Stat } from "@/components/metrics/stat";
import { NetworkIcon } from "@/components/overview/network-icon";
import { formatDate, formatDuration, formatNumber, formatPercent, NO_DATA } from "@/lib/format";
import type { CrossGroup, ReportPost } from "@/lib/reports/analysis";
import { getReports } from "@/lib/reports/reports-data";

export const metadata: Metadata = { title: "Reportes · Metrix" };

const NETWORKS = [
  { key: "youtube", label: "YouTube" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "tiktok", label: "TikTok" },
] as const;

type MetricSpec = { label: string; value: (post: ReportPost) => number | null; format: (value: number | null) => string };
const CROSS_METRICS: MetricSpec[] = [
  { label: "Vistas", value: (post) => post.views, format: (value) => formatNumber(value) },
  { label: "Se queda a los 3 s", value: (post) => post.hook3s, format: (value) => formatPercent(value, 0) },
  { label: "Tiempo medio visto", value: (post) => post.avgWatchSeconds, format: (value) => formatDuration(value) },
  { label: "Engagement", value: (post) => post.engagement, format: (value) => formatPercent(value) },
];

function CrossGroupCard({ group }: { group: CrossGroup }) {
  const columns = NETWORKS.filter((network) => group.posts[network.key]);
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3">
      <p className="font-medium">{group.title}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th scope="col" className="py-1 pr-3 font-normal">
                <span className="sr-only">Métrica</span>
              </th>
              {columns.map((network) => {
                const post = group.posts[network.key]!;
                return (
                  <th key={network.key} scope="col" className="py-1 pr-3 text-right font-normal">
                    <Link href={post.href} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                      <NetworkIcon platform={network.key} className="size-3.5" /> {network.label}
                    </Link>
                    <span className="block text-xs">{post.publishedAt ? formatDate(post.publishedAt) : NO_DATA}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {CROSS_METRICS.map((metric) => {
              const values = columns.map((network) => metric.value(group.posts[network.key]!));
              const known = values.filter((value): value is number => value !== null);
              const best = known.length > 1 ? Math.max(...known) : null;
              return (
                <tr key={metric.label} className="border-t">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal text-muted-foreground">
                    {metric.label}
                  </th>
                  {values.map((value, i) => (
                    <td key={columns[i].key} className={`py-1.5 pr-3 text-right tabular-nums ${value !== null && value === best ? "font-semibold" : ""}`}>
                      {metric.format(value)}
                      {value !== null && value === best ? <span className="sr-only"> (mejor)</span> : null}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function average(values: (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
}

async function Reports() {
  const reports = await getReports();
  if (reports.posts.length === 0) {
    return <EmptyState message="Todavía no hay publicaciones sincronizadas para armar reportes." action={{ href: "/settings/connections", label: "Ir a Configuración" }} />;
  }

  const hooks = reports.posts.filter((post) => post.hook3s !== null).sort((a, b) => b.hook3s! - a.hook3s!);
  const { terms, videos } = reports.seo;
  const relatedViews = terms.filter((term) => term.relatedToTitles).reduce((sum, term) => sum + term.views, 0);
  const totalTermViews = terms.reduce((sum, term) => sum + term.views, 0);

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="El mismo video en todas las redes"
        description="Publicaciones con las mismas palabras en el título y publicadas con menos de 3 días de diferencia. En negritas, la mejor red en cada métrica."
      >
        {reports.groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No se encontraron videos publicados en más de una red con títulos parecidos.</p>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {reports.groups.map((group) => (
              <CrossGroupCard key={group.key} group={group} />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Reporte de hooks"
        description="Qué porcentaje de la audiencia sigue viendo a los 3 segundos. YouTube y Facebook: curva de retención; Instagram: 100 % menos la tasa de salto. TikTok no entrega retención para cuentas personales."
      >
        <div className="grid grid-cols-3 gap-3">
          {NETWORKS.filter((network) => network.key !== "tiktok").map((network) => (
            <Stat
              key={network.key}
              label={`${network.label}: promedio a los 3 s`}
              value={formatPercent(average(hooks.filter((post) => post.platform === network.key).map((post) => post.hook3s)), 0)}
            />
          ))}
        </div>
        {hooks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Las curvas se guardan con el sync semanal de los lunes o con «Cargar historial».</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Publicación</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Se queda a los 3 s</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Tiempo medio</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Duración</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Vistas</th>
                </tr>
              </thead>
              <tbody>
                {hooks.map((post) => (
                  <tr key={post.id} className="border-b last:border-b-0">
                    <td className="max-w-96 px-3 py-2">
                      <Link href={post.href} className="flex items-center gap-2 hover:underline">
                        <NetworkIcon platform={post.platform} className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{post.title}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{formatPercent(post.hook3s, 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatDuration(post.avgWatchSeconds)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatDuration(post.durationSeconds)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(post.views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="SEO de YouTube"
        description="Lo que la gente escribió en YouTube antes de ver tus videos. «Relacionado» = comparte palabras con el título del video."
      >
        {terms.length === 0 ? (
          <p className="text-sm text-muted-foreground">Los términos se guardan con el sync semanal de los lunes o con «Cargar historial».</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {formatPercent(totalTermViews ? (relatedViews / totalTermViews) * 100 : null, 0)} de las vistas desde la búsqueda vienen de términos
              relacionados con tus títulos. Si el porcentaje es bajo, YouTube te muestra como contenido sugerido pero todavía no posicionas para tus
              temas: nombra la empresa, el caso y el tema en el título y la descripción.
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-left text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">Término</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Vistas</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Videos</th>
                      <th scope="col" className="px-3 py-2 font-medium">Relacionado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {terms.slice(0, 25).map((term) => (
                      <tr key={term.term} className="border-b last:border-b-0" title={term.videoTitles.join(" · ")}>
                        <td className="px-3 py-2">{term.term}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(term.views)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{term.videos}</td>
                        <td className="px-3 py-2">{term.relatedToTitles ? "Sí" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="flex flex-col divide-y rounded-xl border text-sm">
                {videos.map((video) => (
                  <li key={video.id} className="flex flex-col gap-0.5 px-3 py-2">
                    <Link href={video.href} className="truncate font-medium hover:underline">
                      {video.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {formatPercent(video.searchShare, 0)} de sus vistas vienen de la búsqueda
                      {video.terms.length ? ` · ${video.terms.slice(0, 3).map((term) => `«${term.term}»`).join(", ")}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </Section>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground">Comparaciones entre redes, hooks y búsqueda, con las cifras acumuladas al último sync.</p>
      </header>
      {/* Reads the session, so it renders at request time. */}
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Reports />
      </Suspense>
    </>
  );
}
