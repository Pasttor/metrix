import { describe, expect, it } from "vitest";
import demographicsCountry from "../../../../tests/fixtures/meta/ig-demographics-country.json";
import media from "../../../../tests/fixtures/meta/ig-media.json";
import { demographicRows, insightValues, mediaMetricsFor, mediaPostType, mediaToPost } from "./instagram-parsers";
import { igMediaSchema, insightsSchema } from "./schemas";

describe("Instagram parsers", () => {
  it("maps media types to post types", () => {
    expect(mediaPostType({ media_type: "VIDEO", media_product_type: "REELS" })).toBe("reel");
    expect(mediaPostType({ media_type: "CAROUSEL_ALBUM", media_product_type: "FEED" })).toBe("carousel");
    expect(mediaPostType({ media_type: "IMAGE", media_product_type: "FEED" })).toBe("image");
    expect(mediaPostType({ media_type: "VIDEO", media_product_type: "FEED" })).toBe("video");
    expect(mediaPostType({ media_type: "IMAGE", media_product_type: "STORY" })).toBe("story");
  });

  it("asks Reels for watch time and skip rate, stories for navigation, feed for neither", () => {
    expect(mediaMetricsFor("reel")).toEqual(expect.arrayContaining(["ig_reels_avg_watch_time", "reels_skip_rate", "total_views"]));
    expect(mediaMetricsFor("carousel")).not.toContain("ig_reels_avg_watch_time");
    expect(mediaMetricsFor("story")).toEqual(["views", "reach", "replies", "shares", "link_clicks", "navigation"]);
  });

  it("builds posts with the right thumbnail", () => {
    const [reel, carousel, image] = media.data.map((item) => mediaToPost(igMediaSchema.parse(item)));
    expect(reel).toMatchObject({ type: "reel", thumbnailUrl: "https://scontent.cdninstagram.com/thumb1.jpg", publishedAt: "2026-11-06T18:00:00+0000" });
    expect(carousel.thumbnailUrl).toBeNull();
    expect(image.thumbnailUrl).toBe("https://scontent.cdninstagram.com/img3.jpg");
  });

  it("reads total_value, lifetime values and breakdown-only metrics, skipping missing ones", () => {
    const values = insightValues(
      insightsSchema.parse({
        data: [
          { name: "reach", total_value: { value: 95 } },
          { name: "views", values: [{ value: 289 }] },
          { name: "navigation", total_value: { breakdowns: [{ results: [{ dimension_values: ["tap_forward"], value: 7 }, { dimension_values: ["tap_exit"], value: 2 }] }] } },
          { name: "weird", values: [{ value: { nested: true } }] },
        ],
      }),
    );
    expect(Object.fromEntries(values)).toEqual({ reach: 95, views: 289, navigation: 9 });
  });

  it("turns follower demographics into audience rows", () => {
    expect(demographicRows(insightsSchema.parse(demographicsCountry), "country")).toEqual([
      { dimension: "country", key: "MX", value: 812 },
      { dimension: "country", key: "US", value: 96 },
    ]);
  });
});
