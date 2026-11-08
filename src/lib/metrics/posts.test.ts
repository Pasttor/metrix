import { describe, expect, it } from "vitest";
import { latestValuesByPost, percentOf, postTitle } from "./posts";

describe("post helpers", () => {
  it("keeps the latest value of each metric per post", () => {
    const latest = latestValuesByPost([
      { postId: "a", capturedOn: "2026-11-07", metric: "views", value: 10 },
      { postId: "a", capturedOn: "2026-11-08", metric: "views", value: 15 },
      { postId: "a", capturedOn: "2026-11-06", metric: "reach", value: 8 },
      { postId: "b", capturedOn: "2026-11-08", metric: "views", value: 3 },
    ]);
    expect(Object.fromEntries(latest.get("a")!)).toEqual({ views: 15, reach: 8 });
    expect(latest.get("b")?.get("views")).toBe(3);
  });

  it("returns null percentages without a usable denominator", () => {
    expect(percentOf(3, 229)).toBeCloseTo(1.31, 2);
    expect(percentOf(3, 0)).toBeNull();
    expect(percentOf(null, 10)).toBeNull();
  });

  it("titles a post with its first caption line", () => {
    const base = { id: "x", type: "reel", permalink: null, thumbnailUrl: null, publishedAt: null, durationSeconds: null };
    expect(postTitle({ ...base, caption: "Por qué quebró\nsegunda línea" })).toBe("Por qué quebró");
    expect(postTitle({ ...base, caption: null })).toBe("Sin texto");
    expect(postTitle({ ...base, caption: "a".repeat(120) })).toHaveLength(90);
  });
});
