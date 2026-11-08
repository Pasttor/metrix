import { describe, expect, it, vi } from "vitest";
import retention from "../../../../tests/fixtures/youtube/analytics-retention.json";
import type { Json } from "@/lib/db/types";
import { getRetentionCurve, RETENTION_CACHE_MS, type RetentionDeps, type RetentionPost } from "./retention";

const NOW = new Date("2026-11-08T18:00:00Z");
const POINTS = [
  { ratio: 0.01, audienceWatchRatio: 1 },
  { ratio: 0.5, audienceWatchRatio: 0.42 },
  { ratio: 1, audienceWatchRatio: 0.18 },
];

function deps(post: RetentionPost | null) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    void input;
    return new Response(JSON.stringify(retention), { headers: { "Content-Type": "application/json" } });
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
    now: () => NOW,
  };
  return { value, fetch, savePostRaw };
}

const post = (raw: Json = {}): RetentionPost => ({
  accountId: "acc-1",
  externalId: "vidLong00001",
  publishedAt: "2026-11-02T17:00:00Z",
  raw,
});

describe("getRetentionCurve", () => {
  it("fetches the curve for the video and caches it in posts.raw without dropping other keys", async () => {
    const d = deps(post({ other: 1 }));
    expect(await getRetentionCurve("post-1", d.value)).toEqual(POINTS);

    const url = new URL(String(d.fetch.mock.calls[0][0]));
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      ids: "channel==MINE",
      dimensions: "elapsedVideoTimeRatio",
      metrics: "audienceWatchRatio",
      filters: "video==vidLong00001",
      startDate: "2026-11-02",
      endDate: "2026-11-08",
    });
    expect(d.savePostRaw).toHaveBeenCalledWith("post-1", { other: 1, retention: { fetchedAt: NOW.toISOString(), points: POINTS } });
  });

  it("serves a fresh cache without calling the API and refetches a stale one", async () => {
    const fresh = deps(post({ retention: { fetchedAt: new Date(NOW.getTime() - 1000).toISOString(), points: [] } }));
    expect(await getRetentionCurve("post-1", fresh.value)).toEqual([]);
    expect(fresh.fetch).not.toHaveBeenCalled();

    const staleAt = new Date(NOW.getTime() - RETENTION_CACHE_MS - 1).toISOString();
    const stale = deps(post({ retention: { fetchedAt: staleAt, points: [] } }));
    expect(await getRetentionCurve("post-1", stale.value)).toEqual(POINTS);
    expect(stale.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns null for an unknown post", async () => {
    expect(await getRetentionCurve("missing", deps(null).value)).toBeNull();
  });
});
