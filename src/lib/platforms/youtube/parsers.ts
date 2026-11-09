import type { AnalyticsReport, Channel, Video } from "./schemas";

/** Rows ready for the long-format tables (account/post ids filled in by the syncer). */
export type DailyMetric = { date: string; metric: string; value: number };
export type AudienceRow<D extends string = "age_gender" | "country" | "device" | "traffic_source"> = { dimension: D; key: string; value: number };
export type PostInput = {
  externalId: string;
  type: "video" | "short";
  caption: string | null;
  permalink: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
};
export type PostMetric = { externalId: string; metric: string; value: number };

/**
 * Heuristic: YouTube has no "is Short" field. Videos of 3 minutes or less are
 * treated as Shorts (the current Shorts length limit).
 */
export const SHORT_MAX_SECONDS = 180;

/** ISO 8601 duration (`PT1H2M3S`, `P1DT2H`, `P0D`) to seconds, or null if unparseable. */
export function parseIsoDuration(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value);
  if (!match) return null;
  const [, weeks, days, hours, minutes, seconds] = match.map((part) => Number(part ?? 0));
  return Math.round(weeks * 604_800 + days * 86_400 + hours * 3600 + minutes * 60 + seconds);
}

/** Numeric value or null; the Data API sends counts as strings and omits hidden ones. */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Report rows as objects keyed by column name. */
export function reportRecords(report: AnalyticsReport): Record<string, string | number | null>[] {
  const names = report.columnHeaders.map((header) => header.name);
  return (report.rows ?? []).map((row) => Object.fromEntries(names.map((name, i) => [name, row[i] ?? null])));
}

/** A `dimensions=day` report as one row per day and metric. Empty report → no rows (no data is not zero). */
export function dailyMetricsFromReport(report: AnalyticsReport): DailyMetric[] {
  const metrics = report.columnHeaders.filter((header) => header.columnType !== "DIMENSION").map((header) => header.name);
  const rows: DailyMetric[] = [];
  for (const record of reportRecords(report)) {
    const date = record.day;
    if (typeof date !== "string") continue;
    for (const metric of metrics) {
      const value = toNumber(record[metric]);
      if (value !== null) rows.push({ date, metric, value });
    }
  }
  return rows;
}

/**
 * A `dimensions=day,<dimension>` report as one row per day, metric and value
 * of the dimension, named "<metric>.<label>.<value>" (e.g. views.content_type.shorts).
 */
export function breakdownDailyMetrics(report: AnalyticsReport, dimension: string, label: string): DailyMetric[] {
  const metrics = report.columnHeaders.filter((header) => header.columnType !== "DIMENSION").map((header) => header.name);
  return reportRecords(report).flatMap((record) => {
    const date = record.day;
    const key = record[dimension];
    if (typeof date !== "string" || typeof key !== "string" || key === "") return [];
    return metrics.flatMap((metric) => {
      const value = toNumber(record[metric]);
      return value === null ? [] : [{ date, metric: `${metric}.${label}.${key}`, value }];
    });
  });
}

/** Channel totals from `channels.list` as metrics of `date`. A hidden subscriber count is skipped. */
export function channelSnapshotMetrics(channel: Channel, date: string): DailyMetric[] {
  const stats = channel.statistics;
  const values: [string, unknown][] = [
    ["subscriberCount", stats?.hiddenSubscriberCount ? null : stats?.subscriberCount],
    ["viewCount", stats?.viewCount],
    ["videoCount", stats?.videoCount],
  ];
  return values.flatMap(([metric, raw]) => {
    const value = toNumber(raw);
    return value === null ? [] : [{ date, metric, value }];
  });
}

function bestVideoThumbnail(video: Video): string | null {
  const t = video.snippet?.thumbnails;
  return t?.high?.url ?? t?.medium?.url ?? t?.standard?.url ?? t?.default?.url ?? t?.maxres?.url ?? null;
}

export function videoToPost(video: Video): PostInput {
  const durationSeconds = parseIsoDuration(video.contentDetails?.duration);
  const isShort = durationSeconds !== null && durationSeconds > 0 && durationSeconds <= SHORT_MAX_SECONDS;
  return {
    externalId: video.id,
    type: isShort ? "short" : "video",
    caption: video.snippet?.title ?? null,
    permalink: isShort ? `https://www.youtube.com/shorts/${video.id}` : `https://www.youtube.com/watch?v=${video.id}`,
    thumbnailUrl: bestVideoThumbnail(video),
    publishedAt: video.snippet?.publishedAt ?? null,
    durationSeconds,
  };
}

/** Cumulative public counters of a video. Hidden like counts are skipped. */
export function videoStatMetrics(video: Video): PostMetric[] {
  const stats = video.statistics;
  const values: [string, unknown][] = [
    ["viewCount", stats?.viewCount],
    ["likeCount", stats?.likeCount],
    ["commentCount", stats?.commentCount],
  ];
  return values.flatMap(([metric, raw]) => {
    const value = toNumber(raw);
    return value === null ? [] : [{ externalId: video.id, metric, value }];
  });
}

/** A `dimensions=video` report as one row per video and metric. */
export function videoMetricsFromReport(report: AnalyticsReport): PostMetric[] {
  const metrics = report.columnHeaders.filter((header) => header.columnType !== "DIMENSION").map((header) => header.name);
  return reportRecords(report).flatMap((record) => {
    const externalId = record.video;
    if (typeof externalId !== "string") return [];
    return metrics.flatMap((metric) => {
      const value = toNumber(record[metric]);
      return value === null ? [] : [{ externalId, metric, value }];
    });
  });
}

/** Audience breakdown report (one or two dimensions and one metric) as audience rows. */
export function audienceFromReport<D extends string>(
  report: AnalyticsReport,
  dimension: D,
  keyColumns: string[],
  metric: string,
): AudienceRow<D>[] {
  return reportRecords(report).flatMap((record) => {
    const parts = keyColumns.map((column) => record[column]);
    const value = toNumber(record[metric]);
    if (value === null || parts.some((part) => typeof part !== "string" || part === "")) return [];
    return [{ dimension, key: parts.join("|"), value }];
  });
}

/**
 * One point of the retention curve. `audienceWatchRatio` can exceed 1 when viewers
 * rewatch (common in Shorts); `relativePerformance` compares with YouTube videos of
 * similar length (0.5 is the median), null when not requested or not available.
 */
export type RetentionPoint = { ratio: number; audienceWatchRatio: number; relativePerformance: number | null };

export function retentionFromReport(report: AnalyticsReport): RetentionPoint[] {
  return reportRecords(report).flatMap((record) => {
    const ratio = toNumber(record.elapsedVideoTimeRatio);
    const audienceWatchRatio = toNumber(record.audienceWatchRatio);
    if (ratio === null || audienceWatchRatio === null) return [];
    return [{ ratio, audienceWatchRatio, relativePerformance: toNumber(record.relativeRetentionPerformance) }];
  });
}
