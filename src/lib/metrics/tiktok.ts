import { relativeChange, type Period } from "./period";
import { MetricIndex, snapshotChange, type MetricRow } from "./series";
import type { Kpi } from "./youtube";

/**
 * TikTok has no daily series, only daily snapshots of cumulative counters
 * since the account was connected. Everything "per period" is a difference
 * between snapshots; without an earlier snapshot it stays null.
 */

export type VideoSnapshot = { postId: string; capturedOn: string; metric: string; value: number };

function latestOnOrBefore(rows: VideoSnapshot[], metric: string, date: string): number | null {
  let best: VideoSnapshot | null = null;
  for (const row of rows) {
    if (row.metric !== metric || row.capturedOn > date) continue;
    if (!best || row.capturedOn > best.capturedOn) best = row;
  }
  return best?.value ?? null;
}

/**
 * Views a video gained in [from, to]: last snapshot by `to` minus the last one
 * before `from`. A video published inside the window counts all its views.
 */
export function videoGain(rows: VideoSnapshot[], publishedAt: string | null, from: string, to: string, metric = "view_count"): number | null {
  const end = latestOnOrBefore(rows, metric, to);
  if (end === null) return null;
  const before = rows.filter((row) => row.metric === metric && row.capturedOn < from);
  if (before.length > 0) return end - latestOnOrBefore(rows, metric, before.reduce((a, b) => (a.capturedOn > b.capturedOn ? a : b)).capturedOn)!;
  return publishedAt && publishedAt.slice(0, 10) >= from ? end : null;
}

/** Sum of the gains of every video with a known gain; null when none is known. */
export function totalGain(videos: { publishedAt: string | null; rows: VideoSnapshot[] }[], from: string, to: string): number | null {
  const gains = videos.map((video) => videoGain(video.rows, video.publishedAt, from, to)).filter((gain): gain is number => gain !== null);
  return gains.length ? gains.reduce((a, b) => a + b, 0) : null;
}

export function computeTikTokKpis(accountRows: MetricRow[], videos: { publishedAt: string | null; rows: VideoSnapshot[] }[], period: Period): Kpi[] {
  const index = new MetricIndex(accountRows);
  const pair = (measure: (from: string, to: string) => number | null) => {
    const value = measure(period.start, period.end);
    const previous = measure(period.previousStart, period.previousEnd);
    return { value, previous, change: relativeChange(value, previous) };
  };
  return [
    { key: "netFollowers", label: "Seguidores netos", format: "count", changeKind: "relative", ...pair((from, to) => snapshotChange(index, "follower_count", from, to)) },
    { key: "likesGained", label: "Likes ganados", format: "count", changeKind: "relative", ...pair((from, to) => snapshotChange(index, "likes_count", from, to)) },
    { key: "newViews", label: "Vistas nuevas", format: "count", changeKind: "relative", ...pair((from, to) => totalGain(videos, from, to)) },
  ];
}
