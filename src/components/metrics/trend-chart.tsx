"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatNumber, formatShortDate } from "@/lib/format";

export type TrendPoint = { date: string; value: number | null; note?: string };

/**
 * Single-series daily line (the title names the series, so no legend).
 * Null days are gaps, never drawn as zero.
 */
export function TrendChart({
  data,
  label,
  formatValue = (value) => formatNumber(value),
}: {
  data: TrendPoint[];
  label: string;
  formatValue?: (value: number) => string;
}) {
  const config = { value: { label, color: "var(--chart-1)" } } satisfies ChartConfig;
  const withYear = data.length > 0 && data[0].date.slice(0, 4) !== data[data.length - 1].date.slice(0, 4);

  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(date: string) => formatShortDate(date, withYear)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          allowDecimals={false}
          domain={["auto", "auto"]}
          tickFormatter={(value: number) => formatNumber(value, { compact: true })}
        />
        <ChartTooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            const point = payload?.[0]?.payload as TrendPoint | undefined;
            if (!active || !point || point.value === null) return null;
            return (
              <div className="grid gap-0.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
                <span className="text-muted-foreground">{formatShortDate(point.date, true)}</span>
                <span className="font-medium tabular-nums">
                  {label}: {formatValue(point.value)}
                </span>
                {point.note ? <span className="text-muted-foreground">{point.note}</span> : null}
              </div>
            );
          }}
        />
        <Line
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          dot={data.filter((point) => point.value !== null).length === 1 ? { r: 4 } : false}
          activeDot={{ r: 4 }}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
