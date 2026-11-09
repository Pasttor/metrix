import { describe, expect, it } from "vitest";
import { periodEndingOn } from "./period";
import { computeTikTokKpis, totalGain, videoGain, type VideoSnapshot } from "./tiktok";

const snap = (capturedOn: string, value: number, metric = "view_count"): VideoSnapshot => ({ postId: "p", capturedOn, metric, value });

describe("videoGain", () => {
  const rows = [snap("2026-11-01", 100), snap("2026-11-03", 160), snap("2026-11-05", 200)];

  it("subtracts the last snapshot before the window from the last one inside it", () => {
    expect(videoGain(rows, "2026-10-20T00:00:00Z", "2026-11-04", "2026-11-05")).toBe(40);
    expect(videoGain(rows, "2026-10-20T00:00:00Z", "2026-11-02", "2026-11-03")).toBe(60);
  });

  it("counts every view of a video published inside the window", () => {
    expect(videoGain([snap("2026-11-05", 50)], "2026-11-04T18:00:00Z", "2026-11-01", "2026-11-07")).toBe(50);
  });

  it("is null without a snapshot before the window for older videos", () => {
    expect(videoGain(rows, "2026-10-20T00:00:00Z", "2026-11-01", "2026-11-05")).toBeNull();
    expect(videoGain([], null, "2026-11-01", "2026-11-05")).toBeNull();
  });
});

describe("TikTok KPIs", () => {
  const account = [
    { date: "2026-11-01", metric: "follower_count", value: 10 },
    { date: "2026-11-01", metric: "likes_count", value: 100 },
    { date: "2026-11-04", metric: "follower_count", value: 14 },
    { date: "2026-11-04", metric: "likes_count", value: 130 },
  ];
  const videos = [
    { publishedAt: "2026-10-01T00:00:00Z", rows: [snap("2026-11-01", 500), snap("2026-11-04", 650)] },
    { publishedAt: "2026-11-03T12:00:00Z", rows: [snap("2026-11-04", 80)] },
  ];

  it("derives net followers, likes gained and new views from snapshots", () => {
    const kpis = Object.fromEntries(computeTikTokKpis(account, videos, periodEndingOn("2026-11-04", 2)).map((kpi) => [kpi.key, kpi.value]));
    expect(kpis).toEqual({ netFollowers: 4, likesGained: 30, newViews: 150 + 80 });
  });

  it("stays null before there are two snapshots", () => {
    const kpis = computeTikTokKpis(account.slice(0, 2), [{ publishedAt: "2026-10-01T00:00:00Z", rows: [snap("2026-11-01", 500)] }], periodEndingOn("2026-11-01", 7));
    expect(kpis.map((kpi) => kpi.value)).toEqual([null, null, null]);
    expect(totalGain([], "2026-11-01", "2026-11-02")).toBeNull();
  });
});
