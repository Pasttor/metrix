import { relativeChange, datesOf, type Period } from "./period";
import { MetricIndex, snapshotChange, snapshotOnOrBefore, type MetricRow, type SeriesPoint } from "./series";
import type { Kpi, KpiFormat } from "./youtube";
import { ageLabel, countryLabel, type AudienceRecord, type ShareRow } from "./youtube-content";

/** Instagram and Facebook dashboard calculations over rows from the database. */

type Window = readonly [string, string];

function windows(period: Period): [Window, Window] {
  return [
    [period.start, period.end],
    [period.previousStart, period.previousEnd],
  ];
}

function amountKpi(key: string, label: string, format: KpiFormat, period: Period, measure: (from: string, to: string) => number | null): Kpi {
  const [value, previous] = windows(period).map(([from, to]) => measure(from, to));
  return { key, label, format, value, previous, change: relativeChange(value, previous), changeKind: "relative" };
}

function rateKpi(key: string, label: string, period: Period, measure: (from: string, to: string) => number | null): Kpi {
  const [value, previous] = windows(period).map(([from, to]) => measure(from, to));
  return { key, label, format: "percent", value, previous, change: value === null || previous === null ? null : value - previous, changeKind: "points" };
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  return numerator === null || !denominator ? null : (numerator / denominator) * 100;
}

/** Last day with daily insights (they arrive up to 48 h late), so both windows are complete. */
export function latestDailyDate(rows: MetricRow[], metric: string): string | null {
  return new MetricIndex(rows).dates(metric).at(-1) ?? null;
}

/**
 * Instagram: net followers (from the daily followers snapshots), views, reach,
 * interactions and engagement (interactions / reach). Reach is summed day by
 * day, so it counts an account once per day it was reached.
 */
export function computeInstagramKpis(rows: MetricRow[], period: Period): Kpi[] {
  const index = new MetricIndex(rows);
  return [
    amountKpi("netFollowers", "Seguidores netos", "count", period, (from, to) => snapshotChange(index, "followers_count", from, to)),
    amountKpi("views", "Vistas", "count", period, (from, to) => index.sum("views", from, to)),
    amountKpi("reach", "Alcance (suma diaria)", "count", period, (from, to) => index.sum("reach", from, to)),
    amountKpi("interactions", "Interacciones", "count", period, (from, to) => index.sum("total_interactions", from, to)),
    rateKpi("engagementRate", "Engagement", period, (from, to) => ratio(index.sum("total_interactions", from, to), index.sum("reach", from, to))),
  ];
}

/** Facebook Page: followers (total and change), unique viewers, interactions and video views. */
export function computeFacebookKpis(rows: MetricRow[], period: Period): Kpi[] {
  const index = new MetricIndex(rows);
  const followers: Kpi = {
    key: "followers",
    label: "Seguidores",
    format: "count",
    value: snapshotOnOrBefore(index, "followers_count", period.end) ?? snapshotOnOrBefore(index, "followers_count", "9999-12-31"),
    previous: null,
    change: null,
    changeKind: "relative",
  };
  const net = snapshotChange(index, "followers_count", period.start, period.end);
  const start = net === null || followers.value === null ? null : followers.value - net;
  followers.previous = start;
  followers.change = relativeChange(followers.value, start);
  return [
    followers,
    amountKpi("uniqueViewers", "Espectadores únicos (suma diaria)", "count", period, (from, to) => index.sum("page_total_media_view_unique", from, to)),
    amountKpi("views", "Vistas", "count", period, (from, to) => index.sum("page_media_view", from, to)),
    amountKpi("interactions", "Interacciones", "count", period, (from, to) => index.sum("page_post_engagements", from, to)),
    amountKpi("videoViews", "Reproducciones de video", "count", period, (from, to) => index.sum("page_video_views", from, to)),
  ];
}

/** Daily followers: the snapshot of each day; days without one stay empty. */
export function followerSeries(rows: MetricRow[], from: string, to: string): SeriesPoint[] {
  const index = new MetricIndex(rows);
  return datesOf(from, to).map((date) => ({ date, value: index.get("followers_count", date) }));
}

export type FollowerDemographics = { age: ShareRow[]; gender: ShareRow[]; countries: ShareRow[]; cities: ShareRow[] };

const GENDER_LABELS: Record<string, string> = { F: "Mujeres", M: "Hombres", U: "Sin especificar" };
const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];

function shareRows(records: AudienceRecord[], label: (key: string) => string, order?: (a: ShareRow, b: ShareRow) => number, limit?: number) {
  const total = records.reduce((sum, record) => sum + record.value, 0);
  const rows = records.map((record) => ({ key: record.key, label: label(record.key), value: record.value, share: total ? record.value / total : 0 }));
  rows.sort(order ?? ((a, b) => b.value - a.value));
  return limit ? rows.slice(0, limit) : rows;
}

/** Instagram follower demographics (age, gender, country, city). Empty under 100 followers. */
export function buildFollowerDemographics(records: AudienceRecord[]): FollowerDemographics {
  const of = (dimension: string) => records.filter((record) => record.dimension === dimension);
  return {
    age: shareRows(of("age"), (key) => (key.startsWith("age") ? ageLabel(key) : key.replace("-", "–")), (a, b) => AGE_ORDER.indexOf(a.key) - AGE_ORDER.indexOf(b.key)),
    gender: shareRows(of("gender"), (key) => GENDER_LABELS[key] ?? key),
    countries: shareRows(of("country"), countryLabel, undefined, 10),
    cities: shareRows(of("city"), (key) => key, undefined, 10),
  };
}
