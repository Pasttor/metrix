"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { SeriesPoint } from "@/lib/metrics/series";
import { formatNumber, formatShortDate } from "@/lib/format";

/** Fixed color per network (categorical slots in a fixed order, never by rank). */
const COLORS: Record<string, string> = { youtube: "var(--chart-1)", instagram: "var(--chart-2)", facebook: "var(--chart-3)", tiktok: "var(--chart-4)" };

type Series = { platform: string; label: string; points: SeriesPoint[] };

function rebase(points: SeriesPoint[]): SeriesPoint[] {
  const base = points.find((point) => point.value !== null && point.value !== 0)?.value ?? null;
  return points.map((point) => ({ date: point.date, value: base === null || point.value === null ? null : (point.value / base) * 100 }));
}

const MODES = [
  ["index", "Índice (base 100)"],
  ["values", "Valores"],
] as const;

/** Followers of every network, as values or indexed to 100 at each network's first day. */
export function FollowersComparisonChart({ series }: { series: Series[] }) {
  const [mode, setMode] = useState<"values" | "index">("index");
  const shown = series.filter((item) => item.points.some((point) => point.value !== null));
  if (shown.length === 0) return <p className="text-sm text-muted-foreground">Todavía no hay fotos diarias de seguidores.</p>;

  const config = Object.fromEntries(shown.map((item) => [item.platform, { label: item.label, color: COLORS[item.platform] }])) satisfies ChartConfig;
  const dates = shown[0].points.map((point) => point.date);
  const prepared = shown.map((item) => ({ ...item, points: mode === "index" ? rebase(item.points) : item.points }));
  const data = dates.map((date, i) => ({ date, ...Object.fromEntries(prepared.map((item) => [item.platform, item.points[i]?.value ?? null])) }));

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Escala" className="flex w-fit gap-1 rounded-lg border p-0.5 text-sm">
        {MODES.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={mode === key}
            onClick={() => setMode(key)}
            className="rounded-md px-2.5 py-1 text-muted-foreground aria-pressed:bg-muted aria-pressed:font-medium aria-pressed:text-foreground"
          >
            {label}
          </button>
        ))}
      </div>
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={(d: string) => formatShortDate(d)} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => (mode === "index" ? `${Math.round(v)}` : formatNumber(v, { compact: true }))}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => formatShortDate(String(payload?.[0]?.payload?.date ?? ""), true)}
                formatter={(value, name) =>
                  `${config[name as string]?.label ?? name}: ${mode === "index" ? Number(value).toFixed(1) : formatNumber(Number(value))}`
                }
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {prepared.map((item) => (
            <Line
              key={item.platform}
              dataKey={item.platform}
              type="monotone"
              stroke={`var(--color-${item.platform})`}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">
        {mode === "index"
          ? "Índice: 100 = seguidores del primer día con datos de cada red. Muestra quién crece más rápido aunque tengan tamaños distintos."
          : "Seguidores totales por día."}
      </p>
    </div>
  );
}
