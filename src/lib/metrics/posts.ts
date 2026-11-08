import type { PostRecord, SnapshotRecord } from "./youtube-content";

/** Generic post table rows, shared by every network's dashboard. */

export type ValueFormat = "count" | "percent" | "duration" | "milliseconds";

export type PostColumn = { key: string; label: string; format: ValueFormat };
export type PostFilter = { key: string; label: string };

export type PostTableRow = {
  id: string;
  title: string;
  /** Matches a PostFilter key. */
  type: string;
  subtitle: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  /** Internal detail page, or the post on the network when `external`. */
  href: string | null;
  external: boolean;
  values: Record<string, number | null>;
};

/** Latest value of each cumulative counter per post. */
export function latestValuesByPost(snapshots: SnapshotRecord[]): Map<string, Map<string, number>> {
  const latest = new Map<string, Map<string, { capturedOn: string; value: number }>>();
  for (const snapshot of snapshots) {
    let metrics = latest.get(snapshot.postId);
    if (!metrics) latest.set(snapshot.postId, (metrics = new Map()));
    const current = metrics.get(snapshot.metric);
    if (!current || snapshot.capturedOn > current.capturedOn) metrics.set(snapshot.metric, snapshot);
  }
  return new Map([...latest].map(([postId, metrics]) => [postId, new Map([...metrics].map(([metric, entry]) => [metric, entry.value]))]));
}

/** Percentage, or null when the denominator is missing or zero. */
export function percentOf(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (numerator === null || numerator === undefined || !denominator) return null;
  return (numerator / denominator) * 100;
}

export function postTitle(post: PostRecord, fallback = "Sin texto"): string {
  const text = post.caption?.trim().split("\n")[0];
  return text ? (text.length > 90 ? `${text.slice(0, 89)}…` : text) : fallback;
}
