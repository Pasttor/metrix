import { describe, expect, it } from "vitest";
import ageGender from "../../../../tests/fixtures/youtube/analytics-age-gender.json";
import daily from "../../../../tests/fixtures/youtube/analytics-channel-daily.json";
import empty from "../../../../tests/fixtures/youtube/analytics-empty.json";
import retention from "../../../../tests/fixtures/youtube/analytics-retention.json";
import lifetime from "../../../../tests/fixtures/youtube/analytics-video-lifetime.json";
import channels from "../../../../tests/fixtures/youtube/channels-list.json";
import videosPage1 from "../../../../tests/fixtures/youtube/videos-page1.json";
import videosPage2 from "../../../../tests/fixtures/youtube/videos-page2.json";
import {
  audienceFromReport,
  channelSnapshotMetrics,
  dailyMetricsFromReport,
  parseIsoDuration,
  retentionFromReport,
  videoMetricsFromReport,
  videoStatMetrics,
  videoToPost,
} from "./parsers";
import { analyticsReportSchema, channelSchema, videoSchema } from "./schemas";

const report = (body: unknown) => analyticsReportSchema.parse(body);
const video = (body: unknown) => videoSchema.parse(body);

describe("parseIsoDuration", () => {
  it.each([
    ["PT12M5S", 725],
    ["PT58S", 58],
    ["PT1H2M3S", 3723],
    ["P1DT2H", 93_600],
    ["PT3M", 180],
    ["P0D", 0],
  ])("%s → %d", (input, seconds) => expect(parseIsoDuration(input)).toBe(seconds));

  it("returns null for missing or malformed values", () => {
    expect(parseIsoDuration(undefined)).toBeNull();
    expect(parseIsoDuration("12:05")).toBeNull();
  });
});

describe("dailyMetricsFromReport", () => {
  it("yields one row per day and metric, keeping real zeros", () => {
    const rows = dailyMetricsFromReport(report(daily));
    expect(rows).toHaveLength(27);
    expect(rows).toContainEqual({ date: "2026-11-04", metric: "views", value: 1200 });
    expect(rows).toContainEqual({ date: "2026-11-05", metric: "averageViewPercentage", value: 43.2 });
    expect(rows).toContainEqual({ date: "2026-11-06", metric: "shares", value: 0 });
  });

  it("writes nothing for an empty report (no data is not zero)", () => {
    expect(dailyMetricsFromReport(report(empty))).toEqual([]);
  });
});

describe("channelSnapshotMetrics", () => {
  const channel = channelSchema.parse(channels.items[0]);

  it("maps channel totals to the report date", () => {
    expect(channelSnapshotMetrics(channel, "2026-11-08")).toEqual([
      { date: "2026-11-08", metric: "subscriberCount", value: 789 },
      { date: "2026-11-08", metric: "viewCount", value: 123456 },
      { date: "2026-11-08", metric: "videoCount", value: 42 },
    ]);
  });

  it("skips a hidden subscriber count", () => {
    const hidden = { ...channel, statistics: { ...channel.statistics, hiddenSubscriberCount: true } };
    expect(channelSnapshotMetrics(hidden, "2026-11-08").map((row) => row.metric)).toEqual(["viewCount", "videoCount"]);
  });
});

describe("videoToPost", () => {
  it("marks 3 minutes or less as short and builds the matching permalink", () => {
    const [long, short] = videosPage1.items.map(video);
    expect(videoToPost(long)).toEqual({
      externalId: "vidLong00001",
      type: "video",
      caption: "Por qué quebró la empresa X",
      permalink: "https://www.youtube.com/watch?v=vidLong00001",
      thumbnailUrl: "https://i.ytimg.com/vi/vidLong00001/hqdefault.jpg",
      publishedAt: "2026-11-02T17:00:00Z",
      durationSeconds: 725,
    });
    expect(videoToPost(short)).toMatchObject({ type: "short", permalink: "https://www.youtube.com/shorts/vidShort0001" });
    expect(videoToPost(video(videosPage2.items[0]))).toMatchObject({ type: "short", durationSeconds: 180 });
  });

  it("keeps zero-length videos (upcoming premieres) as video", () => {
    expect(videoToPost(video({ id: "x", contentDetails: { duration: "P0D" } })).type).toBe("video");
  });
});

describe("videoStatMetrics", () => {
  it("skips hidden like counts instead of writing zero", () => {
    const short = video(videosPage1.items[1]);
    expect(videoStatMetrics(short)).toEqual([
      { externalId: "vidShort0001", metric: "viewCount", value: 40210 },
      { externalId: "vidShort0001", metric: "commentCount", value: 12 },
    ]);
  });
});

describe("report parsers", () => {
  it("parses per-video lifetime metrics", () => {
    const rows = videoMetricsFromReport(report(lifetime));
    expect(rows).toHaveLength(6);
    expect(rows).toContainEqual({ externalId: "vidShort0001", metric: "averageViewPercentage", value: 77.6 });
  });

  it("joins multi-dimension audience keys", () => {
    expect(audienceFromReport(report(ageGender), "age_gender", ["ageGroup", "gender"], "viewerPercentage")).toContainEqual({
      dimension: "age_gender",
      key: "age25-34|female",
      value: 12.9,
    });
  });

  it("parses the retention curve with relative performance", () => {
    expect(retentionFromReport(report(retention))).toEqual([
      { ratio: 0.5, audienceWatchRatio: 0.42, relativePerformance: 0.48 },
      { ratio: 0.01, audienceWatchRatio: 1.26, relativePerformance: 0.61 },
      { ratio: 1, audienceWatchRatio: 0.18, relativePerformance: 0.39 },
    ]);
  });
});
