"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { GrowthPoint } from "@/lib/metrics/youtube-content";
import type { RetentionPoint } from "@/lib/platforms/youtube/parsers";
import { formatDuration, formatNumber, formatPercent, formatShortDate } from "@/lib/format";

function Tip({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="grid gap-0.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <span className="text-muted-foreground">{title}</span>
      {lines.map((line) => (
        <span key={line} className="font-medium tabular-nums">
          {line}
        </span>
      ))}
    </div>
  );
}

/** Views gained per day, from the daily cumulative snapshots. */
export function ViewGrowthChart({ data }: { data: GrowthPoint[] }) {
  const config = { gained: { label: "Vistas nuevas", color: "var(--chart-1)" } } satisfies ChartConfig;
  const points = data.slice(1); // the first snapshot has no previous day to diff against
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">Hace falta al menos un segundo día de datos para ver el crecimiento.</p>;
  }
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={(d: string) => formatShortDate(d)} />
        <YAxis tickLine={false} axisLine={false} width={48} allowDecimals={false} tickFormatter={(v: number) => formatNumber(v, { compact: true })} />
        <ChartTooltip
          cursor={false}
          content={({ active, payload }) => {
            const point = payload?.[0]?.payload as GrowthPoint | undefined;
            if (!active || !point) return null;
            return (
              <Tip
                title={formatShortDate(point.date, true)}
                lines={[`+${formatNumber(point.gained)} vistas`, `Total: ${formatNumber(point.total)}`]}
              />
            );
          }}
        />
        <Bar dataKey="gained" fill="var(--color-gained)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}

/** Retention at a few moments that matter when editing hooks and scripts. */
function KeyMoments({ points, durationSeconds }: { points: RetentionPoint[]; durationSeconds: number | null }) {
  const at = (ratio: number) =>
    points.reduce((best, point) => (Math.abs(point.ratio - ratio) < Math.abs(best.ratio - ratio) ? point : best), points[0]);
  const moments: { label: string; point: RetentionPoint }[] = [];
  if (durationSeconds && durationSeconds > 6) moments.push({ label: "A los 3 s (hook)", point: at(3 / durationSeconds) });
  moments.push({ label: "A la mitad", point: at(0.5) }, { label: "Al final", point: at(1) });
  const relative = points.filter((point) => point.relativePerformance !== null);
  const avgRelative = relative.length ? relative.reduce((sum, point) => sum + point.relativePerformance!, 0) / relative.length : null;
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      {moments.map(({ label, point }) => (
        <div key={label} className="rounded-lg bg-muted/50 px-3 py-2">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="font-semibold tabular-nums">{formatPercent(point.audienceWatchRatio * 100, 0)}</dd>
        </div>
      ))}
      {avgRelative !== null ? (
        <div className="rounded-lg bg-muted/50 px-3 py-2" title="Comparado con videos de YouTube de duración similar. 0.50 es la mediana.">
          <dt className="text-xs text-muted-foreground">Vs. videos similares</dt>
          <dd className="font-semibold tabular-nums">
            {avgRelative.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">(0.50 = mediana)</span>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

type RetentionDatum = { position: number; audienceWatchRatio: number; relativePerformance: number | null };

/**
 * Share of the audience watching at each moment of the video, on a time axis
 * when the duration is known. Above 100 % means viewers rewatched (common in Shorts).
 */
export function RetentionChart({ points, durationSeconds }: { points: RetentionPoint[]; durationSeconds: number | null }) {
  const config = { audienceWatchRatio: { label: "Audiencia", color: "var(--chart-1)" } } satisfies ChartConfig;
  const data: RetentionDatum[] = points.map((point) => ({
    position: point.ratio * 100,
    audienceWatchRatio: point.audienceWatchRatio * 100,
    relativePerformance: point.relativePerformance,
  }));
  const timeAt = (position: number) => (durationSeconds ? formatDuration((position / 100) * durationSeconds) : null);
  const rewatched = data.some((point) => point.audienceWatchRatio > 100);

  return (
    <div className="flex flex-col gap-3">
      <KeyMoments points={points} durationSeconds={durationSeconds} />
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="position"
            type="number"
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(v: number) => timeAt(v) ?? `${v} %`}
          />
          <YAxis tickLine={false} axisLine={false} width={48} domain={[0, "auto"]} tickFormatter={(v: number) => `${Math.round(v)} %`} />
          {rewatched ? <ReferenceLine y={100} stroke="var(--border)" strokeDasharray="4 4" /> : null}
          <ChartTooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as RetentionDatum | undefined;
              if (!active || !point) return null;
              const time = timeAt(point.position);
              const lines = [`${formatPercent(point.audienceWatchRatio, 0)} de la audiencia`];
              if (point.relativePerformance !== null) lines.push(`Vs. videos similares: ${point.relativePerformance.toFixed(2)} (0.50 = mediana)`);
              return <Tip title={`${time ? `${time} · ` : ""}${Math.round(point.position)} % del video`} lines={lines} />;
            }}
          />
          <Line dataKey="audienceWatchRatio" type="monotone" stroke="var(--color-audienceWatchRatio)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ChartContainer>
      {rewatched ? (
        <p className="text-xs text-muted-foreground">Arriba de 100 % significa que la gente volvió a ver esa parte (repeticiones), algo común en Shorts.</p>
      ) : null}
    </div>
  );
}
