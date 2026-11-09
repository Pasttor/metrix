import { describe, expect, it } from "vitest";
import {
  aggregateSearchTerms,
  hookFromSkipRate,
  keywords,
  matchAcrossNetworks,
  retentionAt,
  searchShare,
  similarity,
  type ReportPost,
} from "./analysis";

const post = (overrides: Partial<ReportPost> & Pick<ReportPost, "id" | "platform" | "title">): ReportPost => ({
  caption: null,
  publishedAt: "2026-11-02T18:00:00Z",
  durationSeconds: null,
  href: "#",
  views: null,
  engagement: null,
  avgWatchSeconds: null,
  hook3s: null,
  ...overrides,
});

describe("keywords and similarity", () => {
  it("normalizes accents, drops hashtags, links and stopwords", () => {
    expect(keywords("¿Por qué Blockbuster NO compró Netflix? #negocios https://x.co/a")).toEqual(["blockbuster", "compro", "netflix"]);
  });

  it("scores shared words", () => {
    expect(similarity(["blockbuster", "netflix"], ["netflix", "blockbuster", "quiebra"])).toBe(1);
    expect(similarity(["kodak", "futuro", "1975", "quebro"], ["1975", "ingeniero", "kodak", "camara", "digital"])).toBe(0.5);
    expect(similarity([], ["a"])).toBe(0);
  });
});

describe("matchAcrossNetworks", () => {
  it("groups the same video by words and dates, each post once", () => {
    const posts = [
      post({ id: "yt1", platform: "youtube", title: "¿Por qué Blockbuster no compró Netflix?" }),
      post({ id: "ig1", platform: "instagram", title: "Blockbuster pudo comprar Netflix y no lo hizo", publishedAt: "2026-11-03T01:00:00Z" }),
      post({ id: "fb1", platform: "facebook", title: "¿Por qué Blockbuster no compró Netflix? 🎬", publishedAt: "2026-11-02T20:00:00Z" }),
      post({ id: "fbOld", platform: "facebook", title: "Blockbuster y Netflix", publishedAt: "2026-10-01T20:00:00Z" }),
      post({ id: "yt2", platform: "youtube", title: "Kodak inventó la cámara digital", publishedAt: "2026-11-01T18:00:00Z" }),
    ];
    const groups = matchAcrossNetworks(posts);
    expect(groups).toHaveLength(1);
    expect(Object.fromEntries(Object.entries(groups[0].posts).map(([platform, p]) => [platform, p!.id]))).toEqual({
      youtube: "yt1",
      instagram: "ig1",
      facebook: "fb1",
    });
  });

  it("groups the real videos: short YouTube titles against long captions", () => {
    const day = (d: number) => `2026-11-0${d}T18:00:00Z`;
    const posts = [
      post({ id: "y7", platform: "youtube", title: "Debes miles en tarjetas: ¿te pones a vender cereal?", publishedAt: day(7) }),
      post({ id: "i7", platform: "instagram", title: "Debes miles en tarjetas: ¿te pones a vender cereal? En 2008, los fundadores de Airbnb", publishedAt: day(7) }),
      post({ id: "f7", platform: "facebook", title: "Debes miles en tarjetas: ¿te pones a vender cereal? En 2008, los fundadores de Airbnb", publishedAt: day(7) }),
      post({ id: "y1", platform: "youtube", title: "Kodak tuvo el futuro en 1975 y aun así quebró", publishedAt: day(1) }),
      post({ id: "i1", platform: "instagram", title: "En 1975, un ingeniero de Kodak armó una cámara digital. En 2012, Kodak quebró", publishedAt: day(1) }),
      post({ id: "f1", platform: "facebook", title: "En 1975, un ingeniero de Kodak armó una cámara digital. En 2012, Kodak quebró", publishedAt: day(1) }),
      post({ id: "f0", platform: "facebook", title: "", publishedAt: day(1) }),
    ];
    const groups = matchAcrossNetworks(posts).map((group) => Object.values(group.posts).map((p) => p!.id).sort());
    expect(groups).toEqual([["f7", "i7", "y7"], ["f1", "i1", "y1"]]);
  });

  it("does not match posts published far apart or with different words", () => {
    const posts = [
      post({ id: "yt1", platform: "youtube", title: "Deudas de tarjeta de crédito" }),
      post({ id: "ig1", platform: "instagram", title: "Deudas de tarjeta de crédito", publishedAt: "2026-11-20T18:00:00Z" }),
      post({ id: "fb1", platform: "facebook", title: "Cómo invertir en bolsa" }),
    ];
    expect(matchAcrossNetworks(posts)).toEqual([]);
  });
});

describe("hook retention", () => {
  const curve = [
    { ratio: 0, audienceWatchRatio: 1.25 },
    { ratio: 0.05, audienceWatchRatio: 1.0 },
    { ratio: 0.1, audienceWatchRatio: 0.75 },
    { ratio: 1, audienceWatchRatio: 0.2 },
  ];

  it("reads the curve at 3 s relative to its start (Shorts begin above 100 %)", () => {
    expect(retentionAt(curve, 30)).toBeCloseTo(60); // 3 s of 30 s = ratio 0.1 → 0.75 / 1.25
    expect(retentionAt(curve, 60)).toBeCloseTo(80); // ratio 0.05 → 1.0 / 1.25
  });

  it("is null without a curve or a duration", () => {
    expect(retentionAt([], 30)).toBeNull();
    expect(retentionAt(curve, null)).toBeNull();
  });

  it("turns Instagram's skip rate into the share that stays", () => {
    expect(hookFromSkipRate(44.7)).toBeCloseTo(55.3);
    expect(hookFromSkipRate(null)).toBeNull();
  });
});

describe("SEO", () => {
  it("sums search terms across videos and flags the ones related to the titles", () => {
    const rows = aggregateSearchTerms([
      { title: "¿Por qué Blockbuster no compró Netflix?", terms: [{ term: "blockbuster vs netflix", views: 4 }, { term: "reze x denji", views: 3 }] },
      { title: "La caída de Kodak", terms: [{ term: "reze x denji", views: 2 }] },
    ]);
    expect(rows[0]).toEqual({ term: "reze x denji", views: 5, videos: 2, relatedToTitles: false, videoTitles: ["¿Por qué Blockbuster no compró Netflix?", "La caída de Kodak"] });
    expect(rows[1]).toMatchObject({ term: "blockbuster vs netflix", relatedToTitles: true });
  });

  it("computes the share of views from YouTube search", () => {
    expect(searchShare([{ key: "YT_SEARCH", value: 10 }, { key: "SHORTS", value: 90 }])).toBe(10);
    expect(searchShare([])).toBeNull();
  });
});
