"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useRange } from "@/hooks/use-range";
import type { VideoRow } from "@/lib/metrics/youtube-content";
import { formatDate, formatDuration, formatNumber, formatPercent } from "@/lib/format";
import { withRange } from "@/lib/range";

type SortKey = "publishedAt" | "views" | "likes" | "comments" | "engagement";
type Filter = "all" | "video" | "short";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "views", label: "Vistas" },
  { key: "likes", label: "Me gusta" },
  { key: "comments", label: "Comentarios" },
  { key: "engagement", label: "Engagement" },
  { key: "publishedAt", label: "Publicado" },
];

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "video", label: "Videos" },
  { key: "short", label: "Shorts" },
];

function compare(a: VideoRow, b: VideoRow, key: SortKey): number {
  const x = a[key];
  const y = b[key];
  // Missing values always sort last.
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
}

export function VideoTable({ videos }: { videos: VideoRow[] }) {
  const range = useRange();
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "publishedAt", desc: true });

  const rows = useMemo(() => {
    const filtered = filter === "all" ? videos : videos.filter((video) => video.type === filter);
    return [...filtered].sort((a, b) => {
      const result = compare(a, b, sort.key);
      if (a[sort.key] === null || b[sort.key] === null) return result;
      return sort.desc ? -result : result;
    });
  }, [videos, filter, sort]);

  const counts = { all: videos.length, video: videos.filter((v) => v.type === "video").length, short: videos.filter((v) => v.type === "short").length };

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Tipo de video" className="flex w-fit gap-1 rounded-lg border p-0.5">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={filter === option.key}
            onClick={() => setFilter(option.key)}
            className="rounded-md px-2.5 py-1 text-sm text-muted-foreground aria-pressed:bg-muted aria-pressed:font-medium aria-pressed:text-foreground"
          >
            {option.label} <span className="tabular-nums">({counts[option.key]})</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Video</th>
              {COLUMNS.map((column) => {
                const active = sort.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
                    className="px-3 py-2 text-right font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => setSort({ key: column.key, desc: active ? !sort.desc : true })}
                      className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}
                    >
                      {column.label}
                      {active ? (sort.desc ? <ArrowDown aria-hidden className="size-3" /> : <ArrowUp aria-hidden className="size-3" />) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((video) => (
              <tr key={video.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="max-w-80 px-3 py-2">
                  <Link href={withRange(`/youtube/videos/${video.id}`, range)} className="flex items-center gap-3">
                    {video.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnails, already sized
                      <img src={video.thumbnailUrl} alt="" className="h-10 w-16 shrink-0 rounded object-cover" loading="lazy" />
                    ) : (
                      <span className="h-10 w-16 shrink-0 rounded bg-muted" />
                    )}
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium hover:underline">{video.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {video.type === "short" ? "Short" : "Video"} · {formatDuration(video.durationSeconds)}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(video.views)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(video.likes)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(video.comments)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatPercent(video.engagement)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">
                  {video.publishedAt ? formatDate(video.publishedAt) : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No hay {filter === "short" ? "Shorts" : "videos"} todavía.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Cifras acumuladas al último sync. Se cuenta como Short todo video de 3 minutos o menos. Engagement = (me gusta + comentarios) / vistas.
      </p>
    </div>
  );
}
