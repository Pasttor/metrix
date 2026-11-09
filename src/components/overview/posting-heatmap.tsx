"use client";

import { useState } from "react";
import type { HeatmapCell } from "@/lib/metrics/unified";
import { formatPercent } from "@/lib/format";

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const FILTERS = [
  { key: "all", label: "Todas" },
  { key: "youtube", label: "YouTube" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "tiktok", label: "TikTok" },
];

/**
 * Average engagement by weekday and hour of publication, on a single-hue scale
 * (darker = higher). Every cell carries a text tooltip; empty cells had no posts.
 */
export function PostingHeatmap({ heatmaps, minPosts }: { heatmaps: Record<string, HeatmapCell[] | null>; minPosts: number }) {
  const [filter, setFilter] = useState("all");
  const cells = heatmaps[filter] ?? null;
  const values = (cells ?? []).flatMap((cell) => (cell.engagement === null ? [] : [cell.engagement]));
  const max = values.length ? Math.max(...values) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Red" className="flex w-fit flex-wrap gap-1 rounded-lg border p-0.5 text-sm">
        {FILTERS.filter((option) => option.key in heatmaps).map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={filter === option.key}
            onClick={() => setFilter(option.key)}
            className="rounded-md px-2.5 py-1 text-muted-foreground aria-pressed:bg-muted aria-pressed:font-medium aria-pressed:text-foreground"
          >
            {option.label}
          </button>
        ))}
      </div>
      {cells ? (
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-0.5 text-[10px] text-muted-foreground">
            <thead>
              <tr>
                <th />
                {Array.from({ length: 24 }, (_, hour) => (
                  <th key={hour} scope="col" className="w-6 font-normal">
                    {hour % 3 === 0 ? hour : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day, weekday) => (
                <tr key={day}>
                  <th scope="row" className="pr-1 text-right font-normal">
                    {day}
                  </th>
                  {Array.from({ length: 24 }, (_, hour) => {
                    const cell = cells.find((item) => item.weekday === weekday && item.hour === hour);
                    const engagement = cell?.engagement ?? null;
                    const strength = engagement === null || max === 0 ? 0 : 0.15 + 0.85 * (engagement / max);
                    return (
                      <td
                        key={hour}
                        title={
                          engagement === null
                            ? `${day} ${hour}:00 · sin publicaciones`
                            : `${day} ${hour}:00 · ${cell?.posts} publicación(es) · engagement medio ${formatPercent(engagement)}`
                        }
                        className="h-6 w-6 rounded-sm bg-muted"
                        style={
                          engagement === null ? undefined : { backgroundColor: `color-mix(in oklab, var(--chart-1) ${Math.round(strength * 100)}%, transparent)` }
                        }
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Hacen falta al menos {minPosts} publicaciones con métricas para calcular las mejores horas.</p>
      )}
      <p className="text-xs text-muted-foreground">
        Hora de publicación en Ciudad de México. Más oscuro = mayor engagement medio. Pasa el cursor sobre una celda para ver el detalle.
      </p>
    </div>
  );
}
