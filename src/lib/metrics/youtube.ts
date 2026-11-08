import { addDays } from "@/lib/dates";
import { datesOf, relativeChange, type Period } from "./period";
import { MetricIndex, type MetricRow, type SeriesPoint } from "./series";

export type { MetricRow, SeriesPoint } from "./series";

/**
 * YouTube dashboard calculations over rows read from the database. Missing
 * data stays null (never zero) so the UI can say "sin datos".
 */

export type KpiFormat = "count" | "hours" | "duration" | "percent";
export type Kpi = {
  key: string;
  label: string;
  format: KpiFormat;
  value: number | null;
  previous: number | null;
  /** Relative change for amounts; percentage points for rates. */
  change: number | null;
  changeKind: "relative" | "points";
};

/** Last day with channel analytics (they arrive 2–3 days late), so periods compare full days. */
export function latestAnalyticsDate(rows: MetricRow[]): string | null {
  return new MetricIndex(rows).dates("views").at(-1) ?? null;
}

function netSubscribers(index: MetricIndex, from: string, to: string): number | null {
  const gained = index.sum("subscribersGained", from, to);
  const lost = index.sum("subscribersLost", from, to);
  return gained === null && lost === null ? null : (gained ?? 0) - (lost ?? 0);
}

function engagementRate(index: MetricIndex, from: string, to: string): number | null {
  const views = index.sum("views", from, to);
  if (!views) return null;
  const interactions = ["likes", "comments", "shares"].map((metric) => index.sum(metric, from, to));
  if (interactions.every((value) => value === null)) return null;
  return (interactions.reduce<number>((total, value) => total + (value ?? 0), 0) / views) * 100;
}

export function computeKpis(rows: MetricRow[], period: Period): Kpi[] {
  const index = new MetricIndex(rows);
  const windows = [
    [period.start, period.end],
    [period.previousStart, period.previousEnd],
  ] as const;

  const amount = (key: Kpi["key"], label: string, format: KpiFormat, measure: (from: string, to: string) => number | null): Kpi => {
    const [value, previous] = windows.map(([from, to]) => measure(from, to));
    return { key, label, format, value, previous, change: relativeChange(value, previous), changeKind: "relative" };
  };

  const minutes = (from: string, to: string) => index.sum("estimatedMinutesWatched", from, to);
  const [engagement, previousEngagement] = windows.map(([from, to]) => engagementRate(index, from, to));

  return [
    amount("netSubscribers", "Suscriptores netos", "count", (from, to) => netSubscribers(index, from, to)),
    amount("views", "Vistas", "count", (from, to) => index.sum("views", from, to)),
    amount("watchHours", "Horas vistas", "hours", (from, to) => {
      const value = minutes(from, to);
      return value === null ? null : value / 60;
    }),
    amount("avgViewDuration", "Duración media", "duration", (from, to) =>
      index.weightedAverage("averageViewDuration", "views", from, to),
    ),
    {
      key: "engagementRate",
      label: "Engagement",
      format: "percent",
      value: engagement,
      previous: previousEngagement,
      change: engagement === null || previousEngagement === null ? null : engagement - previousEngagement,
      changeKind: "points",
    },
  ];
}

export { dailySeries } from "./series";

export type SubscriberPoint = SeriesPoint & { estimated: boolean };

/**
 * Total subscribers per day. Uses the daily `subscriberCount` snapshot when it
 * exists; days before the first snapshot are estimated backwards from it with
 * the daily gained/lost counts (snapshots only exist since the account was connected).
 */
export function subscriberSeries(rows: MetricRow[], period: Pick<Period, "start" | "end">): SubscriberPoint[] {
  const index = new MetricIndex(rows);
  const snapshotDates = index.dates("subscriberCount");
  const anchorDate = snapshotDates[0];
  const dates = datesOf(period.start, period.end);
  if (!anchorDate) return dates.map((date) => ({ date, value: null, estimated: false }));

  const anchor = index.get("subscriberCount", anchorDate)!;
  const net = (date: string) => (index.get("subscribersGained", date) ?? 0) - (index.get("subscribersLost", date) ?? 0);

  // Walk back from the anchor: total(d) = total(d + 1) - net(d + 1).
  const estimates = new Map<string, number>();
  let total = anchor;
  if (dates[0] < anchorDate) {
    for (let date = addDays(anchorDate, -1); date >= dates[0]; date = addDays(date, -1)) {
      total -= net(addDays(date, 1));
      estimates.set(date, total);
    }
  }

  return dates.map((date) => {
    const snapshot = index.get("subscriberCount", date);
    if (snapshot !== null) return { date, value: snapshot, estimated: false };
    if (date < anchorDate && estimates.has(date)) return { date, value: Math.max(0, estimates.get(date)!), estimated: true };
    return { date, value: null, estimated: false };
  });
}
