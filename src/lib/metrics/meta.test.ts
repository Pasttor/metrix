import { describe, expect, it } from "vitest";
import { buildFollowerDemographics, computeFacebookKpis, computeInstagramKpis, followerSeries, latestDailyDate } from "./meta";
import { periodEndingOn } from "./period";
import type { MetricRow } from "./series";

const day = (date: string, values: Record<string, number>): MetricRow[] =>
  Object.entries(values).map(([metric, value]) => ({ date, metric, value }));

const byKey = <T extends { key: string }>(items: T[]) => Object.fromEntries(items.map((item) => [item.key, item]));

describe("Instagram KPIs", () => {
  const rows = [
    ...day("2026-11-01", { followers_count: 10, views: 100, reach: 50, total_interactions: 5 }),
    ...day("2026-11-02", { views: 100, reach: 50, total_interactions: 5 }),
    ...day("2026-11-03", { followers_count: 14, views: 300, reach: 100, total_interactions: 20 }),
    ...day("2026-11-04", { followers_count: 15, views: 100, reach: 100, total_interactions: 0 }),
  ];
  const kpis = byKey(computeInstagramKpis(rows, periodEndingOn("2026-11-04", 2)));

  it("sums views, reach and interactions and compares with the previous window", () => {
    expect(kpis.views).toMatchObject({ value: 400, previous: 200, change: 1 });
    expect(kpis.reach).toMatchObject({ value: 200, previous: 100 });
    expect(kpis.interactions).toMatchObject({ value: 20, previous: 10 });
  });

  it("computes engagement as interactions / reach, its change in points", () => {
    expect(kpis.engagementRate).toMatchObject({ value: 10, previous: 10, change: 0, changeKind: "points" });
  });

  it("derives net followers from snapshots and stays null without an earlier one", () => {
    expect(kpis.netFollowers.value).toBe(5); // 15 on 11-04 minus 10 (last snapshot before 11-03)
    expect(kpis.netFollowers.previous).toBeNull();
  });

  it("anchors on the last day with insights and lists followers per day", () => {
    expect(latestDailyDate(rows, "views")).toBe("2026-11-04");
    expect(followerSeries(rows, "2026-11-01", "2026-11-03").map((p) => p.value)).toEqual([10, null, 14]);
  });
});

describe("Facebook KPIs", () => {
  it("shows followers with their change and sums the daily Page metrics", () => {
    const rows = [
      ...day("2026-11-02", { followers_count: 20, page_total_media_view_unique: 10, page_media_view: 12, page_post_engagements: 1, page_video_views: 4 }),
      ...day("2026-11-03", { page_total_media_view_unique: 30, page_media_view: 40, page_post_engagements: 2, page_video_views: 6 }),
      ...day("2026-11-04", { followers_count: 25, page_total_media_view_unique: 20, page_media_view: 25, page_post_engagements: 0, page_video_views: 5 }),
    ];
    const kpis = byKey(computeFacebookKpis(rows, periodEndingOn("2026-11-04", 2)));
    expect(kpis.followers).toMatchObject({ value: 25, previous: 20, change: 0.25 });
    expect(kpis.uniqueViewers.value).toBe(50);
    expect(kpis.views.value).toBe(65);
    expect(kpis.interactions.value).toBe(2);
    expect(kpis.videoViews).toMatchObject({ value: 11, previous: 4 });
  });

  it("keeps everything null without data", () => {
    const kpis = byKey(computeFacebookKpis([], periodEndingOn("2026-11-04", 7)));
    expect(kpis.followers.value).toBeNull();
    expect(kpis.uniqueViewers.value).toBeNull();
  });
});

describe("buildFollowerDemographics", () => {
  it("orders ages, labels genders and countries, and keeps the top 10", () => {
    const demographics = buildFollowerDemographics([
      { dimension: "age", key: "25-34", value: 60 },
      { dimension: "age", key: "18-24", value: 40 },
      { dimension: "gender", key: "M", value: 70 },
      { dimension: "gender", key: "F", value: 30 },
      { dimension: "country", key: "MX", value: 90 },
      { dimension: "city", key: "Ciudad de México, Distrito Federal", value: 50 },
    ]);
    expect(demographics.age.map((row) => [row.label, row.share])).toEqual([
      ["18–24", 0.4],
      ["25–34", 0.6],
    ]);
    expect(demographics.gender[0]).toMatchObject({ label: "Hombres", share: 0.7 });
    expect(demographics.countries[0].label).toBe("México");
    expect(demographics.cities[0].label).toBe("Ciudad de México, Distrito Federal");
  });
});
