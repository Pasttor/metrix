import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { z } from "zod";
import { Section } from "@/components/metrics/section";
import { Stat } from "@/components/metrics/stat";
import { RetentionChart, ViewGrowthChart } from "@/components/youtube/video-charts";
import { formatDate, formatDuration, formatValue } from "@/lib/format";
import { FB_TYPE_LABELS, getFacebookPostDetail } from "@/lib/metrics/meta-data";
import type { ValueFormat } from "@/lib/metrics/posts";
import { parseRange, RANGE_PARAM, withRange } from "@/lib/range";

export const metadata: Metadata = { title: "Publicación · Facebook · Metrix" };

type Props = PageProps<"/facebook/posts/[postId]">;
type StatSpec = { metric: string; label: string; format?: ValueFormat; hint?: string };

const STATS: StatSpec[] = [
  { metric: "post_media_view", label: "Vistas" },
  { metric: "post_total_media_view_unique", label: "Espectadores únicos" },
  { metric: "reactions", label: "Reacciones" },
  { metric: "comments", label: "Comentarios" },
  { metric: "shares", label: "Compartidos" },
  { metric: "post_clicks", label: "Clics" },
];
const VIDEO_STATS: StatSpec[] = [
  { metric: "fb_reels_total_plays", label: "Reproducciones", hint: "Total de reproducciones del Reel, con repeticiones" },
  { metric: "blue_reels_play_count", label: "Reproducciones iniciales", hint: "Reproducciones sin contar repeticiones" },
  { metric: "fb_reels_replay_count", label: "Repeticiones" },
  { metric: "post_video_views", label: "Vistas de 3 s o más" },
  { metric: "post_video_views_15s", label: "Vistas de 15 s o más" },
  { metric: "post_video_complete_views_organic", label: "Vistas completas", hint: "Orgánicas: personas que vieron el video completo" },
  { metric: "post_video_avg_time_watched", label: "Tiempo medio visto", format: "milliseconds" },
  { metric: "post_video_view_time", label: "Tiempo total visto", format: "milliseconds" },
];

async function PostDetail({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ postId }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(postId).success) notFound();
  const post = await getFacebookPostDetail(postId);
  if (!post) notFound();

  const isVideo = post.type === "video" || post.type === "reel";
  const shown = [...STATS, ...(isVideo ? VIDEO_STATS : [])].filter((stat) => post.latest[stat.metric] !== undefined);

  return (
    <>
      <Link href={withRange("/facebook", parseRange(query[RANGE_PARAM]))} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" /> Facebook
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {post.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote Facebook thumbnail
          <img src={post.thumbnailUrl} alt="" className="aspect-[4/5] w-full rounded-lg object-cover sm:w-40" />
        ) : null}
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{post.title}</h1>
          <p className="text-sm text-muted-foreground">
            {FB_TYPE_LABELS[post.type] ?? post.type}
            {post.durationSeconds ? ` · ${formatDuration(post.durationSeconds)}` : ""}
            {post.publishedAt ? ` · Publicado el ${formatDate(post.publishedAt)}` : ""}
          </p>
          {post.permalink ? (
            <a href={post.permalink} target="_blank" rel="noreferrer" className="flex w-fit items-center gap-1 text-sm underline underline-offset-4">
              Ver en Facebook <ExternalLink aria-hidden className="size-3.5" />
            </a>
          ) : null}
        </div>
      </header>

      {shown.length > 0 ? (
        <section aria-label="Totales de la publicación" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {shown.map((stat) => (
            <Stat key={stat.metric} label={stat.label} value={formatValue(post.latest[stat.metric] ?? null, stat.format ?? "count")} hint={stat.hint} />
          ))}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay métricas guardadas de esta publicación.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Vistas nuevas por día" description="Diferencia entre las fotos diarias del contador de vistas.">
          <ViewGrowthChart data={post.growth} />
        </Section>
        {isVideo ? (
          <Section title="Retención de audiencia" description="Qué porcentaje de la audiencia sigue viendo en cada momento del video. Úsala para ver dónde se cae el hook.">
            {post.retention.length > 0 ? (
              <RetentionChart points={post.retention} durationSeconds={post.durationSeconds} />
            ) : (
              <p className="text-sm text-muted-foreground">La curva aparece después del siguiente sync de Facebook.</p>
            )}
          </Section>
        ) : null}
      </div>
      {post.caption ? (
        <Section title="Texto">
          <p className="text-sm whitespace-pre-line text-muted-foreground">{post.caption}</p>
        </Section>
      ) : null}
    </>
  );
}

export default function FacebookPostPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <PostDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}
