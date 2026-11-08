"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { AgeGenderRow } from "@/lib/metrics/youtube-content";
import { formatPercent } from "@/lib/format";

const BASE_CONFIG = {
  female: { label: "Mujeres", color: "var(--chart-1)" },
  male: { label: "Hombres", color: "var(--chart-2)" },
  other: { label: "Otro", color: "var(--chart-3)" },
} satisfies ChartConfig;

/** Viewer percentage by age group, one bar per gender (fixed color per gender, with a legend). */
export function AgeGenderChart({ rows }: { rows: AgeGenderRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Sin datos todavía.</p>;
  const genders = (["female", "male", "other"] as const).filter((gender) => rows.some((row) => row[gender] > 0));
  const config = Object.fromEntries(genders.map((gender) => [gender, BASE_CONFIG[gender]])) satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 8 }} barGap={2} accessibilityLayer>
        <CartesianGrid horizontal={false} />
        <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={48} />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(value: number) => `${value} %`} />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent formatter={(value, name) => `${config[name as keyof typeof config]?.label ?? name}: ${formatPercent(Number(value))}`} />}
        />
        <ChartLegend content={<ChartLegendContent />} />
        {genders.map((gender) => (
          <Bar key={gender} dataKey={gender} fill={`var(--color-${gender})`} radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
