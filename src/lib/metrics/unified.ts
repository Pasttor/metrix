import { addDays } from "@/lib/dates";
import { datesOf, relativeChange, type Period } from "./period";
import { MetricIndex, snapshotOnOrBefore, type MetricRow, type SeriesPoint } from "./series";

/**
 * Cross-network calculations on unified metric names (metric_catalog.unified_metric:
 * followers, views, likes, comments, shares, interactions...). Missing data stays null.
 */

export type CatalogEntry = { platform: string; scope: string; metric: string; unifiedMetric: string | null };

/** platform → scope → native metric → unified name. */
export type UnifiedMap = Map<string, Map<string, Map<string, string>>>;

export function buildUnifiedMap(catalog: CatalogEntry[]): UnifiedMap {
  const map: UnifiedMap = new Map();
  for (const entry of catalog) {
    if (!entry.unifiedMetric) continue;
    let scopes = map.get(entry.platform);
    if (!scopes) map.set(entry.platform, (scopes = new Map()));
    let metrics = scopes.get(entry.scope);
    if (!metrics) scopes.set(entry.scope, (metrics = new Map()));
    metrics.set(entry.metric, entry.unifiedMetric);
  }
  return map;
}

/** Account rows renamed to their unified metric; metrics without one are dropped. */
export function unifyAccountRows(rows: MetricRow[], platform: string, map: UnifiedMap): MetricRow[] {
  const names = map.get(platform)?.get("account");
  if (!names) return [];
  return rows.flatMap((row) => {
    const unified = names.get(row.metric);
    return unified ? [{ ...row, metric: unified }] : [];
  });
}

/**
 * A post's latest values by unified name. When two native metrics map to the
 * same name (Instagram `likes` insight and `like_count` counter), the larger wins.
 */
export function unifyPostValues(values: Map<string, number> | undefined, platform: string, map: UnifiedMap): Map<string, number> {
  const names = map.get(platform)?.get("post");
  const result = new Map<string, number>();
  if (!values || !names) return result;
  for (const [metric, value] of values) {
    const unified = names.get(metric);
    if (unified) result.set(unified, Math.max(result.get(unified) ?? Number.NEGATIVE_INFINITY, value));
  }
  return result;
}

/** Interactions (or likes + comments + shares when a network has no total) over views, in percent. */
export function engagementRate(values: { interactions?: number | null; likes?: number | null; comments?: number | null; shares?: number | null; views?: number | null }): number | null {
  if (!values.views) return null;
  const parts = [values.likes, values.comments, values.shares].filter((value): value is number => typeof value === "number");
  const interactions = typeof values.interactions === "number" ? values.interactions : parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  return interactions === null ? null : (interactions / values.views) * 100;
}

export type NetworkSummary = {
  followers: number | null;
  followersChange: number | null;
  views: number | null;
  viewsChange: number | null;
  engagement: number | null;
  /** In percentage points. */
  engagementChange: number | null;
};

function windowEngagement(index: MetricIndex, from: string, to: string): number | null {
  return engagementRate({
    interactions: index.sum("interactions", from, to),
    likes: index.sum("likes", from, to),
    comments: index.sum("comments", from, to),
    shares: index.sum("shares", from, to),
    views: index.sum("views", from, to),
  });
}

/** Followers (latest, and change over the period), views and engagement vs the previous period. */
export function summarizeNetwork(unifiedRows: MetricRow[], period: Period): NetworkSummary {
  const index = new MetricIndex(unifiedRows);
  const followerDates = index.dates("followers");
  const latest = followerDates.at(-1);
  const followers = latest ? index.get("followers", latest) : null;
  const before = followerDates.filter((date) => date < period.start).at(-1);
  const followersChange = followers !== null && before ? followers - index.get("followers", before)! : null;

  const views = index.sum("views", period.start, period.end);
  const previousViews = index.sum("views", period.previousStart, period.previousEnd);
  const engagement = windowEngagement(index, period.start, period.end);
  const previousEngagement = windowEngagement(index, period.previousStart, period.previousEnd);
  return {
    followers,
    followersChange,
    views,
    viewsChange: relativeChange(views, previousViews),
    engagement,
    engagementChange: engagement === null || previousEngagement === null ? null : engagement - previousEngagement,
  };
}

/** Daily followers (last snapshot carried to days without one, from the first snapshot on). */
export function followerTrend(unifiedRows: MetricRow[], from: string, to: string): SeriesPoint[] {
  const index = new MetricIndex(unifiedRows);
  const first = index.dates("followers")[0];
  return datesOf(from, to).map((date) => ({ date, value: first && date >= first ? snapshotOnOrBefore(index, "followers", date) : null }));
}

/** Rebases a series to 100 at its first value so networks of different size compare. */
export function indexTo100(series: SeriesPoint[]): SeriesPoint[] {
  const base = series.find((point) => point.value !== null && point.value !== 0)?.value ?? null;
  return series.map((point) => ({ date: point.date, value: base === null || point.value === null ? null : (point.value / base) * 100 }));
}

export type HeatmapPost = { network: string; publishedAt: string; engagement: number };
export type HeatmapCell = { weekday: number; hour: number; posts: number; engagement: number | null };

export const MIN_HEATMAP_POSTS = 10;

/**
 * Average engagement by weekday (0 = Monday) and hour of publication in the
 * reporting time zone. Returns null under MIN_HEATMAP_POSTS posts.
 */
export function postingHeatmap(posts: HeatmapPost[], timeZone: string): HeatmapCell[] | null {
  if (posts.length < MIN_HEATMAP_POSTS) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", hourCycle: "h23" });
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const totals = new Map<string, { sum: number; count: number }>();
  for (const post of posts) {
    const fields = Object.fromEntries(parts.formatToParts(new Date(post.publishedAt)).map((part) => [part.type, part.value]));
    const key = `${days.indexOf(fields.weekday)}|${Number(fields.hour)}`;
    const entry = totals.get(key) ?? { sum: 0, count: 0 };
    entry.sum += post.engagement;
    entry.count += 1;
    totals.set(key, entry);
  }
  const cells: HeatmapCell[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let hour = 0; hour < 24; hour++) {
      const entry = totals.get(`${weekday}|${hour}`);
      cells.push({ weekday, hour, posts: entry?.count ?? 0, engagement: entry ? entry.sum / entry.count : null });
    }
  }
  return cells;
}

/** The followers window for the chart: the last `days` days up to `today`. */
export function trendWindow(today: string, days: number) {
  return { from: addDays(today, -(days - 1)), to: today };
}
