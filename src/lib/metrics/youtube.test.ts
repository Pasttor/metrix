import { describe, expect, it } from "vitest";
import { datesOf, periodEndingOn, relativeChange } from "./period";
import { computeKpis, dailySeries, latestAnalyticsDate, subscriberSeries, type MetricRow } from "./youtube";

const day = (date: string, values: Record<string, number>): MetricRow[] =>
  Object.entries(values).map(([metric, value]) => ({ date, metric, value }));

describe("period", () => {
  it("builds the window and the previous one of the same length", () => {
    expect(periodEndingOn("2026-11-06", 7)).toEqual({
      start: "2026-10-31",
      end: "2026-11-06",
      previousStart: "2026-10-24",
      previousEnd: "2026-10-30",
      days: 7,
    });
    expect(datesOf("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("has no relative change without a non-zero previous value", () => {
    expect(relativeChange(150, 100)).toBe(0.5);
    expect(relativeChange(10, 0)).toBeNull();
    expect(relativeChange(null, 10)).toBeNull();
  });
});

const rows: MetricRow[] = [
  // previous window (2 days)
  ...day("2026-11-01", { views: 100, estimatedMinutesWatched: 120, averageViewDuration: 60, subscribersGained: 2, subscribersLost: 1, likes: 5, comments: 1, shares: 0 }),
  ...day("2026-11-02", { views: 100, estimatedMinutesWatched: 180, averageViewDuration: 120, subscribersGained: 1, subscribersLost: 0, likes: 3, comments: 1, shares: 0 }),
  // current window
  ...day("2026-11-03", { views: 300, estimatedMinutesWatched: 600, averageViewDuration: 100, subscribersGained: 5, subscribersLost: 1, likes: 20, comments: 4, shares: 3 }),
  ...day("2026-11-04", { views: 100, estimatedMinutesWatched: 60, averageViewDuration: 20, subscribersGained: 0, subscribersLost: 2, likes: 2, comments: 0, shares: 1 }),
  ...day("2026-11-05", { subscriberCount: 40 }),
];

describe("computeKpis", () => {
  const kpis = Object.fromEntries(computeKpis(rows, periodEndingOn("2026-11-04", 2)).map((kpi) => [kpi.key, kpi]));

  it("sums amounts and compares with the previous window", () => {
    expect(kpis.views).toMatchObject({ value: 400, previous: 200, change: 1 });
    expect(kpis.netSubscribers).toMatchObject({ value: 2, previous: 2, change: 0 });
    expect(kpis.watchHours).toMatchObject({ value: 11, previous: 5 });
  });

  it("weights average view duration by views", () => {
    expect(kpis.avgViewDuration.value).toBe((100 * 300 + 20 * 100) / 400);
    expect(kpis.avgViewDuration.previous).toBe(90);
  });

  it("reports engagement as a percent and its change in points", () => {
    expect(kpis.engagementRate.value).toBeCloseTo(7.5);
    expect(kpis.engagementRate.previous).toBeCloseTo(5);
    expect(kpis.engagementRate).toMatchObject({ changeKind: "points" });
    expect(kpis.engagementRate.change).toBeCloseTo(2.5);
  });

  it("keeps null (not zero) when a window has no data", () => {
    const empty = Object.fromEntries(computeKpis(rows, periodEndingOn("2026-10-20", 7)).map((kpi) => [kpi.key, kpi]));
    expect(empty.views).toMatchObject({ value: null, previous: null, change: null });
    expect(empty.engagementRate.value).toBeNull();
  });
});

describe("series", () => {
  it("anchors on the last day with channel analytics", () => {
    expect(latestAnalyticsDate(rows)).toBe("2026-11-04");
    expect(latestAnalyticsDate([])).toBeNull();
  });

  it("returns one point per day with null gaps", () => {
    expect(dailySeries(rows, "views", { start: "2026-11-03", end: "2026-11-05" })).toEqual([
      { date: "2026-11-03", value: 300 },
      { date: "2026-11-04", value: 100 },
      { date: "2026-11-05", value: null },
    ]);
  });

  it("uses subscriber snapshots and estimates earlier days from gained/lost", () => {
    expect(subscriberSeries(rows, { start: "2026-11-02", end: "2026-11-06" })).toEqual([
      { date: "2026-11-02", value: 38, estimated: true }, // 40 − net(11-05: 0) − net(11-04: −2) − net(11-03: +4)
      { date: "2026-11-03", value: 42, estimated: true },
      { date: "2026-11-04", value: 40, estimated: true },
      { date: "2026-11-05", value: 40, estimated: false },
      { date: "2026-11-06", value: null, estimated: false },
    ]);
  });

  it("has no subscriber series without any snapshot", () => {
    expect(subscriberSeries(rows.filter((row) => row.metric !== "subscriberCount"), { start: "2026-11-03", end: "2026-11-03" })).toEqual([
      { date: "2026-11-03", value: null, estimated: false },
    ]);
  });
});
