import { describe, expect, it } from "vitest";
import discovery from "../../../../tests/fixtures/meta/ig-business-discovery.json";
import { competitorMetrics, competitorProfile, igUsernameSchema, type Discovery } from "./competitors";

const NOW = new Date("2026-11-08T12:00:00Z");
const data = discovery.business_discovery as Discovery;

describe("competitor metrics", () => {
  const metrics = Object.fromEntries(competitorMetrics(data, NOW).map((row) => [row.metric, row.value]));

  it("keeps followers and posts, and counts posts of the last 7 and 30 days", () => {
    expect(metrics.followers_count).toBe(10000);
    expect(metrics.media_count).toBe(420);
    expect(metrics.posts_last_7d).toBe(4);
    expect(metrics.posts_last_30d).toBe(10);
  });

  it("averages likes and comments of the 12 latest posts, skipping hidden like counts", () => {
    // Posts 0..11, post 1 hides its likes: (100 + 120 + 130 + ... + 210) / 11
    const likes = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => 100 + i * 10);
    expect(metrics.avg_likes_recent).toBeCloseTo(likes.reduce((a, b) => a + b, 0) / likes.length);
    expect(metrics.avg_comments_recent).toBe(5);
    expect(metrics.engagement_rate_recent).toBeCloseTo(((metrics.avg_likes_recent + 5) / 10000) * 100);
  });

  it("reads the profile", () => {
    expect(competitorProfile(data)).toEqual({ name: "Finanzas para todos", avatarUrl: "https://scontent.cdninstagram.com/comp.jpg" });
  });

  it("writes no averages without posts", () => {
    const rows = competitorMetrics({ followers_count: 5, media_count: 0 }, NOW);
    expect(rows.map((row) => row.metric)).toEqual(["followers_count", "media_count"]);
  });
});

describe("igUsernameSchema", () => {
  it("normalizes and validates usernames", () => {
    expect(igUsernameSchema.parse(" @FinanzasParaTodos ")).toBe("finanzasparatodos");
    expect(igUsernameSchema.safeParse("no válido!").success).toBe(false);
    expect(igUsernameSchema.safeParse("").success).toBe(false);
  });
});
