import { datesOf } from "./period";

/** Shared calculations over long-format metric rows. Missing data stays null, never 0. */

export type MetricRow = { date: string; metric: string; value: number };
export type SeriesPoint = { date: string; value: number | null };

export class MetricIndex {
  private readonly byMetric = new Map<string, Map<string, number>>();

  constructor(rows: MetricRow[]) {
    for (const row of rows) {
      let byDate = this.byMetric.get(row.metric);
      if (!byDate) this.byMetric.set(row.metric, (byDate = new Map()));
      byDate.set(row.date, row.value);
    }
  }

  get(metric: string, date: string): number | null {
    return this.byMetric.get(metric)?.get(date) ?? null;
  }

  dates(metric: string): string[] {
    return [...(this.byMetric.get(metric)?.keys() ?? [])].sort();
  }

  /** Sum over [from, to], or null when no day in the range has the metric. */
  sum(metric: string, from: string, to: string): number | null {
    let total: number | null = null;
    for (const [date, value] of this.byMetric.get(metric) ?? []) {
      if (date >= from && date <= to) total = (total ?? 0) + value;
    }
    return total;
  }

  /** Average of `metric` weighted by `weight` per day (e.g. view duration by views). */
  weightedAverage(metric: string, weight: string, from: string, to: string): number | null {
    let numerator = 0;
    let denominator = 0;
    for (const [date, value] of this.byMetric.get(metric) ?? []) {
      if (date < from || date > to) continue;
      const w = this.get(weight, date);
      if (w === null) continue;
      numerator += value * w;
      denominator += w;
    }
    return denominator === 0 ? null : numerator / denominator;
  }
}

export function dailySeries(rows: MetricRow[], metric: string, period: { start: string; end: string }): SeriesPoint[] {
  const index = new MetricIndex(rows);
  return datesOf(period.start, period.end).map((date) => ({ date, value: index.get(metric, date) }));
}

/** Latest snapshot of `metric` on or before `date` (totals such as followers). */
export function snapshotOnOrBefore(index: MetricIndex, metric: string, date: string): number | null {
  const dates = index.dates(metric).filter((d) => d <= date);
  return dates.length ? index.get(metric, dates[dates.length - 1]) : null;
}

/**
 * Change of a total (e.g. followers) across [from, to]: last snapshot by `to`
 * minus the last one before `from`. Null until both exist.
 */
export function snapshotChange(index: MetricIndex, metric: string, from: string, to: string): number | null {
  const end = snapshotOnOrBefore(index, metric, to);
  const datesBefore = index.dates(metric).filter((d) => d < from);
  if (end === null || datesBefore.length === 0) return null;
  return end - index.get(metric, datesBefore[datesBefore.length - 1])!;
}

export type BreakdownShare = { key: string; label: string; value: number; share: number };

/**
 * Totals over [from, to] of a metric stored per breakdown value
 * ("<metric>.<label>.<value>", e.g. reach.format.reel), as shares of their sum.
 */
export function breakdownShares(
  rows: MetricRow[],
  metric: string,
  label: string,
  from: string,
  to: string,
  names: Record<string, string> = {},
): BreakdownShare[] {
  const prefix = `${metric}.${label}.`;
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.metric.startsWith(prefix) || row.date < from || row.date > to) continue;
    const key = row.metric.slice(prefix.length);
    totals.set(key, (totals.get(key) ?? 0) + row.value);
  }
  const sum = [...totals.values()].reduce((total, value) => total + value, 0);
  return [...totals]
    .map(([key, value]) => ({ key, label: names[key] ?? key, value, share: sum ? value / sum : 0 }))
    .sort((a, b) => b.value - a.value);
}
