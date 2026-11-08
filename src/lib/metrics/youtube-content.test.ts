import { describe, expect, it } from "vitest";
import { ageLabel, buildAudience, buildVideoRows, countryLabel, viewGrowth } from "./youtube-content";

describe("buildVideoRows", () => {
  const post = { permalink: null, thumbnailUrl: null, publishedAt: "2026-11-02T17:00:00Z", durationSeconds: 58 };

  it("uses the latest snapshot of each counter and computes engagement", () => {
    const [row] = buildVideoRows(
      [{ id: "p1", type: "short", caption: "Hola", ...post }],
      [
        { postId: "p1", capturedOn: "2026-11-07", metric: "viewCount", value: 100 },
        { postId: "p1", capturedOn: "2026-11-08", metric: "viewCount", value: 200 },
        { postId: "p1", capturedOn: "2026-11-08", metric: "likeCount", value: 8 },
        { postId: "p1", capturedOn: "2026-11-08", metric: "commentCount", value: 2 },
      ],
    );
    expect(row).toMatchObject({ title: "Hola", type: "short", views: 200, likes: 8, comments: 2, engagement: 5 });
  });

  it("leaves counters and engagement null without snapshots", () => {
    const [row] = buildVideoRows([{ id: "p2", type: "video", caption: null, ...post }], []);
    expect(row).toMatchObject({ title: "Sin título", views: null, engagement: null });
  });
});

describe("viewGrowth", () => {
  it("returns daily totals and gains, sorted by date", () => {
    expect(
      viewGrowth([
        { capturedOn: "2026-11-08", value: 150 },
        { capturedOn: "2026-11-06", value: 100 },
        { capturedOn: "2026-11-07", value: 120 },
      ]),
    ).toEqual([
      { date: "2026-11-06", total: 100, gained: null },
      { date: "2026-11-07", total: 120, gained: 20 },
      { date: "2026-11-08", total: 150, gained: 30 },
    ]);
  });
});

describe("buildAudience", () => {
  const audience = buildAudience([
    { dimension: "age_gender", key: "age25-34|male", value: 38 },
    { dimension: "age_gender", key: "age18-24|male", value: 21 },
    { dimension: "age_gender", key: "age25-34|female", value: 13 },
    { dimension: "age_gender", key: "age65-|user_specified", value: 1 },
    ...Array.from({ length: 12 }, (_, i) => ({ dimension: "country", key: ["MX", "US", "ES", "AR", "CO", "CL", "PE", "GT", "EC", "VE", "BO", "UY"][i], value: 120 - i * 10 })),
    { dimension: "device", key: "MOBILE", value: 75 },
    { dimension: "device", key: "DESKTOP", value: 25 },
    { dimension: "traffic_source", key: "SHORTS", value: 9 },
    { dimension: "traffic_source", key: "NEW_SOURCE", value: 1 },
  ]);

  it("orders age groups and splits them by gender", () => {
    expect(audience.ageGender).toEqual([
      { age: "age18-24", label: "18–24", male: 21, female: 0, other: 0 },
      { age: "age25-34", label: "25–34", male: 38, female: 13, other: 0 },
      { age: "age65-", label: "65+", male: 0, female: 0, other: 1 },
    ]);
  });

  it("keeps the top 10 countries with Spanish names and shares", () => {
    expect(audience.countries).toHaveLength(10);
    expect(audience.countries[0]).toMatchObject({ key: "MX", label: "México", value: 120 });
  });

  it("labels devices and traffic sources, falling back to the raw key", () => {
    expect(audience.devices[0]).toEqual({ key: "MOBILE", label: "Celular", value: 75, share: 0.75 });
    expect(audience.trafficSources.map((row) => row.label)).toEqual(["Feed de Shorts", "NEW_SOURCE"]);
  });
});

describe("labels", () => {
  it("formats age groups and country codes", () => {
    expect(ageLabel("age35-44")).toBe("35–44");
    expect(ageLabel("age65-")).toBe("65+");
    expect(countryLabel("US")).toBe("Estados Unidos");
  });
});
