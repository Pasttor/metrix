import { describe, expect, it } from "vitest";
import { breakdownShares, MetricIndex, snapshotChange } from "./series";

describe("breakdownShares", () => {
  const rows = [
    { date: "2026-11-01", metric: "reach.format.reel", value: 60 },
    { date: "2026-11-02", metric: "reach.format.reel", value: 30 },
    { date: "2026-11-02", metric: "reach.format.post", value: 10 },
    { date: "2026-11-02", metric: "reach", value: 100 },
    { date: "2026-10-01", metric: "reach.format.story", value: 999 },
  ];

  it("sums each breakdown value in the window and labels it", () => {
    expect(breakdownShares(rows, "reach", "format", "2026-11-01", "2026-11-30", { reel: "Reels" })).toEqual([
      { key: "reel", label: "Reels", value: 90, share: 0.9 },
      { key: "post", label: "post", value: 10, share: 0.1 },
    ]);
  });

  it("returns nothing without breakdown rows", () => {
    expect(breakdownShares(rows, "views", "format", "2026-11-01", "2026-11-30")).toEqual([]);
  });
});

describe("snapshotChange", () => {
  it("needs a snapshot before the window", () => {
    const index = new MetricIndex([
      { date: "2026-11-01", metric: "followers_count", value: 10 },
      { date: "2026-11-05", metric: "followers_count", value: 13 },
    ]);
    expect(snapshotChange(index, "followers_count", "2026-11-02", "2026-11-06")).toBe(3);
    expect(snapshotChange(index, "followers_count", "2026-11-01", "2026-11-06")).toBeNull();
  });
});
