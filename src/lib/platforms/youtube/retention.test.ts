import { describe, expect, it, vi } from "vitest";
import retention from "../../../../tests/fixtures/youtube/analytics-retention.json";
import type { Json } from "@/lib/db/types";
import {
  getRetentionCurve,
  RECENT_RETENTION_CACHE_MS,
  RETENTION_CACHE_MS,
  retentionCacheMs,
  type RetentionDeps,
  type RetentionPost,
} from "./retention";

const NOW = new Date("2026-11-08T18:00:00Z");
// Sorted by position, whatever order the API returns.
const POINTS = [
  { ratio: 0.01, audienceWatchRatio: 1.26, relativePerformance: 0.61 },
  { ratio: 0.5, audienceWatchRatio: 0.42, relativePerformance: 0.48 },
  { ratio: 1, audienceWatchRatio: 0.18, relativePerformance: 0.39 },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function deps(post: RetentionPost | null) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    void input;
    return json(retention);
  });
  const savePostRaw = vi.fn(async (postId: string, raw: Json) => {
    void postId;
    void raw;
  });
  const value: RetentionDeps = {
    getPost: async () => post,
    savePostRaw,
    getAccessToken: async () => "ya29.token",
    fetch: fetch as unknown as typeof globalThis.fetch,
    retry: { sleep: async () => undefined },
    now: () => NOW,
  };
  return { value, fetch, savePostRaw };
}

const post = (raw: Json = {}, publishedAt = "2026-11-02T17:00:00Z"): RetentionPost => ({
  accountId: "acc-1",
  externalId: "vidLong00001",
  publishedAt,
  raw,
});

const requestedUrl = (fetch: ReturnType<typeof deps>["fetch"], call = 0) => new URL(String(fetch.mock.calls[call][0]));

describe("getRetentionCurve", () => {
  it("asks for the curve and relative performance, sorts it and caches it without dropping other keys", async () => {
    const d = deps(post({ other: 1 }));
    expect(await getRetentionCurve("post-1", d.value)).toEqual(POINTS);

    const url = requestedUrl(d.fetch);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      ids: "channel==MINE",
      dimensions: "elapsedVideoTimeRatio",
      metrics: "audienceWatchRatio,relativeRetentionPerformance",
      filters: "video==vidLong00001",
      startDate: "2026-11-01", // publish day in Pacific time, minus one day of margin
      endDate: "2026-11-08",
    });
    expect(url.searchParams.has("sort")).toBe(false); // the retention report rejects sort
    expect(d.savePostRaw).toHaveBeenCalledWith("post-1", { other: 1, retention: { fetchedAt: NOW.toISOString(), points: POINTS } });
  });

  it("falls back to the plain curve if YouTube rejects relative performance", async () => {
    const d = deps(post());
    d.fetch.mockImplementationOnce(async () => json({ error: { errors: [{ reason: "badRequest" }] } }, 400));
    d.fetch.mockImplementationOnce(async () =>
      json({
        columnHeaders: [
          { name: "elapsedVideoTimeRatio", columnType: "DIMENSION" },
          { name: "audienceWatchRatio", columnType: "METRIC" },
        ],
        rows: [[0.5, 0.4]],
      }),
    );
    expect(await getRetentionCurve("post-1", d.value)).toEqual([{ ratio: 0.5, audienceWatchRatio: 0.4, relativePerformance: null }]);
    expect(requestedUrl(d.fetch, 1).searchParams.get("metrics")).toBe("audienceWatchRatio");
  });

  it("refreshes once when Google answers 401 to the stored token", async () => {
    const d = deps(post());
    const tokens: (boolean | undefined)[] = [];
    d.value.getAccessToken = async (_id, options) => {
      tokens.push(options?.forceRefresh);
      return options?.forceRefresh ? "fresh" : "revoked";
    };
    d.fetch.mockImplementationOnce(async () => json({ error: { errors: [{ reason: "authError" }] } }, 401));
    expect(await getRetentionCurve("post-1", d.value)).toEqual(POINTS);
    expect(tokens).toEqual([false, true]);
  });

  it("serves a fresh cache without calling the API and refetches a stale one", async () => {
    const fresh = deps(post({ retention: { fetchedAt: new Date(NOW.getTime() - 1000).toISOString(), points: [] } }));
    expect(await getRetentionCurve("post-1", fresh.value)).toEqual([]);
    expect(fresh.fetch).not.toHaveBeenCalled();

    const staleAt = new Date(NOW.getTime() - RECENT_RETENTION_CACHE_MS - 1).toISOString();
    const stale = deps(post({ retention: { fetchedAt: staleAt, points: [] } }));
    expect(await getRetentionCurve("post-1", stale.value)).toEqual(POINTS);
    expect(stale.fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps recent videos' curves for a day and older ones for a week", () => {
    expect(retentionCacheMs("2026-11-02T17:00:00Z", NOW)).toBe(RECENT_RETENTION_CACHE_MS);
    expect(retentionCacheMs("2025-01-01T00:00:00Z", NOW)).toBe(RETENTION_CACHE_MS);
  });

  it("returns null for an unknown post", async () => {
    expect(await getRetentionCurve("missing", deps(null).value)).toBeNull();
  });
});
