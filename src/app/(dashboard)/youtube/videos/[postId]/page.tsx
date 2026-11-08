import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { z } from "zod";
import { Section } from "@/components/metrics/section";
import { RetentionChart, ViewGrowthChart } from "@/components/youtube/video-charts";
import { formatDate, formatDuration, formatHours, formatNumber, formatPercent } from "@/lib/format";
import { getVideoDetail } from "@/lib/metrics/youtube-data";
import { loadRetention } from "@/lib/metrics/youtube-retention";
import { parseRange, RANGE_PARAM, withRange } from "@/lib/range";

export const metadata: Metadata = { title: "Video · YouTube · Metrix" };

type Props = PageProps<"/youtube/videos/[postId]">;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border bg-card p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}

async function Retention({ postId, durationSeconds }: { postId: string; durationSeconds: number | null }) {
  const result = await loadRetention(postId);
  if (result.status === "unavailable") return <p className="text-sm text-muted-foreground">{result.message}</p>;
  if (result.points.length === 0) {
    return <p className="text-sm text-muted-foreground">YouTube todavía no tiene datos de retención para este video.</p>;
  }
  return <RetentionChart points={result.points} durationSeconds={durationSeconds} />;
}

async function VideoDetail({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ postId }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(postId).success) notFound();
  const video = await getVideoDetail(postId);
  if (!video) notFound();
  const back = withRange("/youtube", parseRange(query[RANGE_PARAM]));
  const minutes = video.lifetime.estimatedMinutesWatched;

  return (
    <>
      <Link href={back} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" /> YouTube
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {video.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail
          <img src={video.thumbnailUrl} alt="" className="aspect-video w-full rounded-lg object-cover sm:w-56" />
        ) : null}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{video.title}</h1>
          <p className="text-sm text-muted-foreground">
            {video.type === "short" ? "Short" : "Video"} · {formatDuration(video.durationSeconds)}
            {video.publishedAt ? ` · Publicado el ${formatDate(video.publishedAt)}` : ""}
          </p>
          {video.permalink ? (
            <a href={video.permalink} target="_blank" rel="noreferrer" className="flex w-fit items-center gap-1 text-sm underline underline-offset-4">
              Ver en YouTube <ExternalLink aria-hidden className="size-3.5" />
            </a>
          ) : null}
        </div>
      </header>

      <section aria-label="Totales del video" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Vistas" value={formatNumber(video.latest.views)} />
        <Stat label="Me gusta" value={formatNumber(video.latest.likes)} />
        <Stat label="Comentarios" value={formatNumber(video.latest.comments)} />
        <Stat label="Horas vistas" value={formatHours(minutes === null ? null : minutes / 60)} />
        <Stat label="Duración media de vista" value={formatDuration(video.lifetime.averageViewDuration)} />
        <Stat label="Porcentaje medio visto" value={formatPercent(video.lifetime.averageViewPercentage)} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Vistas nuevas por día" description="Diferencia entre las fotos diarias del contador de vistas.">
          <ViewGrowthChart data={video.growth} />
        </Section>
        <Section title="Retención de audiencia" description="Qué porcentaje de la audiencia sigue viendo en cada segundo del video. Úsala para ver dónde se cae el hook o el guion.">
          <Suspense fallback={<div className="h-56 animate-pulse rounded-lg bg-muted" />}>
            <Retention postId={video.id} durationSeconds={video.durationSeconds} />
          </Suspense>
        </Section>
      </div>
      <p className="text-xs text-muted-foreground">
        Horas vistas, duración y porcentaje medio son acumulados de YouTube Analytics y se actualizan cada lunes para videos de los
        últimos 90 días.
      </p>
    </>
  );
}

export default function VideoPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <VideoDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}
