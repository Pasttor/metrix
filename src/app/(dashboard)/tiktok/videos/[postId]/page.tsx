import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { z } from "zod";
import { Section } from "@/components/metrics/section";
import { Stat } from "@/components/metrics/stat";
import { ViewGrowthChart } from "@/components/youtube/video-charts";
import { formatDate, formatDuration, formatNumber, formatPercent } from "@/lib/format";
import { percentOf } from "@/lib/metrics/posts";
import { getTikTokVideoDetail } from "@/lib/metrics/tiktok-data";
import { parseRange, RANGE_PARAM, withRange } from "@/lib/range";

export const metadata: Metadata = { title: "Video · TikTok · Metrix" };

type Props = PageProps<"/tiktok/videos/[postId]">;

async function VideoDetail({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ postId }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(postId).success) notFound();
  const video = await getTikTokVideoDetail(postId);
  if (!video) notFound();
  const v = (metric: string) => video.latest[metric] ?? null;
  const interactions = ["like_count", "comment_count", "share_count"].map(v).filter((n): n is number => n !== null);

  return (
    <>
      <Link href={withRange("/tiktok", parseRange(query[RANGE_PARAM]))} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" /> TikTok
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {video.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote TikTok cover
          <img src={video.thumbnailUrl} alt="" className="aspect-[9/16] w-full rounded-lg object-cover sm:w-36" />
        ) : null}
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{video.title}</h1>
          <p className="text-sm text-muted-foreground">
            Video · {formatDuration(video.durationSeconds)}
            {video.publishedAt ? ` · Publicado el ${formatDate(video.publishedAt)}` : ""}
          </p>
          {video.permalink ? (
            <a href={video.permalink} target="_blank" rel="noreferrer" className="flex w-fit items-center gap-1 text-sm underline underline-offset-4">
              Ver en TikTok <ExternalLink aria-hidden className="size-3.5" />
            </a>
          ) : null}
        </div>
      </header>

      <section aria-label="Totales del video" className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Vistas" value={formatNumber(v("view_count"))} />
        <Stat label="Likes" value={formatNumber(v("like_count"))} />
        <Stat label="Comentarios" value={formatNumber(v("comment_count"))} />
        <Stat label="Compartidos" value={formatNumber(v("share_count"))} />
        <Stat
          label="Engagement"
          value={formatPercent(interactions.length ? percentOf(interactions.reduce((a, b) => a + b, 0), v("view_count")) : null)}
          hint="(likes + comentarios + compartidos) / vistas"
        />
      </section>

      <Section title="Vistas nuevas por día" description="Diferencia entre las fotos diarias del contador de vistas (TikTok no entrega series diarias).">
        <ViewGrowthChart data={video.growth} />
      </Section>
      {video.caption ? (
        <Section title="Texto">
          <p className="text-sm whitespace-pre-line text-muted-foreground">{video.caption}</p>
        </Section>
      ) : null}
    </>
  );
}

export default function TikTokVideoPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <VideoDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}
