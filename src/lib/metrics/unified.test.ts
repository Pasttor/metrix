import { describe, expect, it } from "vitest";
import { periodEndingOn } from "./period";
import {
  buildUnifiedMap,
  engagementRate,
  followerTrend,
  indexTo100,
  postingHeatmap,
  summarizeNetwork,
  unifyAccountRows,
  unifyPostValues,
  type CatalogEntry,
} from "./unified";

const catalog: CatalogEntry[] = [
  { platform: "youtube", scope: "account", metric: "subscriberCount", unifiedMetric: "followers" },
  { platform: "youtube", scope: "account", metric: "views", unifiedMetric: "views" },
  { platform: "youtube", scope: "account", metric: "likes", unifiedMetric: "likes" },
  { platform: "youtube", scope: "account", metric: "comments", unifiedMetric: "comments" },
  { platform: "youtube", scope: "account", metric: "averageViewPercentage", unifiedMetric: null },
  { platform: "instagram", scope: "post", metric: "likes", unifiedMetric: "likes" },
  { platform: "instagram", scope: "post", metric: "like_count", unifiedMetric: "likes" },
  { platform: "instagram", scope: "post", metric: "views", unifiedMetric: "views" },
];
const map = buildUnifiedMap(catalog);

describe("unified names", () => {
  it("renames account metrics and drops those without a unified name", () => {
    const rows = unifyAccountRows(
      [
        { date: "2026-11-01", metric: "subscriberCount", value: 3 },
        { date: "2026-11-01", metric: "averageViewPercentage", value: 40 },
      ],
      "youtube",
      map,
    );
    expect(rows).toEqual([{ date: "2026-11-01", metric: "followers", value: 3 }]);
    expect(unifyAccountRows(rows, "tiktok", map)).toEqual([]);
  });

  it("keeps the larger value when two post metrics share a unified name", () => {
    const values = unifyPostValues(new Map([["likes", 3], ["like_count", 5], ["views", 100]]), "instagram", map);
    expect(Object.fromEntries(values)).toEqual({ likes: 5, views: 100 });
  });
});

describe("engagementRate", () => {
  it("uses interactions when present, else likes + comments + shares", () => {
    expect(engagementRate({ interactions: 10, likes: 99, views: 200 })).toBe(5);
    expect(engagementRate({ likes: 8, comments: 2, views: 100 })).toBe(10);
  });

  it("is null without views or without any interaction data", () => {
    expect(engagementRate({ likes: 5, views: 0 })).toBeNull();
    expect(engagementRate({ views: 100 })).toBeNull();
  });
});

describe("summarizeNetwork", () => {
  const rows = [
    { date: "2026-10-30", metric: "followers", value: 10 },
    { date: "2026-11-01", metric: "views", value: 100 },
    { date: "2026-11-01", metric: "likes", value: 5 },
    { date: "2026-11-02", metric: "views", value: 100 },
    { date: "2026-11-02", metric: "likes", value: 5 },
    { date: "2026-11-03", metric: "views", value: 300 },
    { date: "2026-11-03", metric: "likes", value: 30 },
    { date: "2026-11-04", metric: "views", value: 100 },
    { date: "2026-11-04", metric: "likes", value: 10 },
    { date: "2026-11-04", metric: "followers", value: 16 },
  ];

  it("computes views change, engagement change in points and followers change", () => {
    const summary = summarizeNetwork(rows, periodEndingOn("2026-11-04", 2));
    expect(summary).toMatchObject({ followers: 16, followersChange: 6, views: 400, viewsChange: 1 });
    expect(summary.engagement).toBe(10);
    expect(summary.engagementChange).toBe(5);
  });

  it("stays null without data", () => {
    expect(summarizeNetwork([], periodEndingOn("2026-11-04", 7))).toEqual({
      followers: null,
      followersChange: null,
      views: null,
      viewsChange: null,
      engagement: null,
      engagementChange: null,
    });
  });
});

describe("follower series", () => {
  const rows = [
    { date: "2026-11-02", metric: "followers", value: 10 },
    { date: "2026-11-04", metric: "followers", value: 12 },
  ];

  it("carries the last snapshot forward from the first one", () => {
    expect(followerTrend(rows, "2026-11-01", "2026-11-05").map((p) => p.value)).toEqual([null, 10, 10, 12, 12]);
  });

  it("rebases to 100", () => {
    expect(indexTo100(followerTrend(rows, "2026-11-02", "2026-11-04")).map((p) => p.value)).toEqual([100, 100, 120]);
  });
});

describe("postingHeatmap", () => {
  it("needs at least 10 posts", () => {
    expect(postingHeatmap([{ network: "youtube", publishedAt: "2026-11-02T18:00:00Z", engagement: 5 }], "America/Mexico_City")).toBeNull();
  });

  it("averages engagement by weekday and hour in the reporting time zone", () => {
    // 2026-11-02 18:00Z is Monday 12:00 in Mexico City.
    const posts = Array.from({ length: 10 }, (_, i) => ({ network: "instagram", publishedAt: "2026-11-02T18:00:00Z", engagement: i < 5 ? 2 : 4 }));
    const cells = postingHeatmap(posts, "America/Mexico_City")!;
    expect(cells).toHaveLength(7 * 24);
    expect(cells.find((cell) => cell.weekday === 0 && cell.hour === 12)).toEqual({ weekday: 0, hour: 12, posts: 10, engagement: 3 });
    expect(cells.find((cell) => cell.weekday === 1 && cell.hour === 12)?.engagement).toBeNull();
  });
});
