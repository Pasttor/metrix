import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { z } from "zod";
import { Section } from "@/components/metrics/section";
import { Stat } from "@/components/metrics/stat";
import { ViewGrowthChart } from "@/components/youtube/video-charts";
import { formatDate, formatValue } from "@/lib/format";
import { getInstagramPostDetail, IG_TYPE_LABELS } from "@/lib/metrics/meta-data";
import { percentOf, type ValueFormat } from "@/lib/metrics/posts";
import { parseRange, RANGE_PARAM, withRange } from "@/lib/range";

export const metadata: Metadata = { title: "Publicación · Instagram · Metrix" };

type Props = PageProps<"/instagram/posts/[postId]">;
type StatSpec = { metric: string; label: string; format?: ValueFormat; hint?: string };

const FEED_STATS: StatSpec[] = [
  { metric: "views", label: "Vistas" },
  { metric: "reach", label: "Alcance" },
  { metric: "likes", label: "Me gusta" },
  { metric: "comments", label: "Comentarios" },
  { metric: "saved", label: "Guardados" },
  { metric: "shares", label: "Compartidos" },
  { metric: "reposts", label: "Reposts" },
  { metric: "total_interactions", label: "Interacciones" },
  { metric: "total_views", label: "Vistas totales", hint: "Incluye promociones y vistas en Facebook" },
];
const REEL_STATS: StatSpec[] = [
  { metric: "ig_reels_avg_watch_time", label: "Tiempo medio visto", format: "milliseconds" },
  { metric: "ig_reels_video_view_total_time", label: "Tiempo total visto", format: "milliseconds" },
  { metric: "reels_skip_rate", label: "Tasa de salto", format: "percent", hint: "Porcentaje de vistas que se saltaron el Reel en los primeros 3 segundos" },
];
const STORY_STATS: StatSpec[] = [
  { metric: "views", label: "Vistas" },
  { metric: "reach", label: "Alcance" },
  { metric: "replies", label: "Respuestas" },
  { metric: "shares", label: "Compartidos" },
  { metric: "navigation", label: "Navegación", hint: "Toques para avanzar, retroceder, salir o pasar a la siguiente historia" },
  { metric: "link_clicks", label: "Clics en enlace" },
];

async function PostDetail({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ postId }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(postId).success) notFound();
  const post = await getInstagramPostDetail(postId);
  if (!post) notFound();

  const stats = post.type === "story" ? STORY_STATS : post.type === "reel" ? [...FEED_STATS, ...REEL_STATS] : FEED_STATS;
  const shown = stats.filter((stat) => post.latest[stat.metric] !== undefined);
  const engagement = percentOf(post.latest.total_interactions, post.latest.reach);

  return (
    <>
      <Link href={withRange("/instagram", parseRange(query[RANGE_PARAM]))} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" /> Instagram
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {post.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote Instagram thumbnail
          <img src={post.thumbnailUrl} alt="" className="aspect-[4/5] w-full rounded-lg object-cover sm:w-40" />
        ) : null}
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{post.title}</h1>
          <p className="text-sm text-muted-foreground">
            {IG_TYPE_LABELS[post.type] ?? post.type}
            {post.publishedAt ? ` · Publicado el ${formatDate(post.publishedAt)}` : ""}
          </p>
          {post.permalink ? (
            <a href={post.permalink} target="_blank" rel="noreferrer" className="flex w-fit items-center gap-1 text-sm underline underline-offset-4">
              Ver en Instagram <ExternalLink aria-hidden className="size-3.5" />
            </a>
          ) : null}
        </div>
      </header>

      {shown.length > 0 ? (
        <section aria-label="Totales de la publicación" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {shown.map((stat) => (
            <Stat key={stat.metric} label={stat.label} value={formatValue(post.latest[stat.metric] ?? null, stat.format ?? "count")} hint={stat.hint} />
          ))}
          {post.type !== "story" && engagement !== null ? <Stat label="Engagement" value={formatValue(engagement, "percent")} hint="Interacciones / alcance" /> : null}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          Meta no tiene insights de esta publicación (por ejemplo, si se publicó antes de cambiar a cuenta profesional).
        </p>
      )}

      <Section title="Vistas nuevas por día" description="Diferencia entre las fotos diarias del contador de vistas.">
        <ViewGrowthChart data={post.growth} />
      </Section>
      {post.caption ? (
        <Section title="Texto">
          <p className="text-sm whitespace-pre-line text-muted-foreground">{post.caption}</p>
        </Section>
      ) : null}
    </>
  );
}

export default function InstagramPostPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <PostDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}
