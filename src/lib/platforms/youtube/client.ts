import { requestJson, type FetchFn, type RetryOptions } from "@/lib/platforms/http";
import {
  analyticsReportSchema,
  channelListSchema,
  playlistItemListSchema,
  videoListSchema,
  type AnalyticsReport,
  type Channel,
  type Video,
} from "./schemas";

export const YOUTUBE_DATA_API = "https://www.googleapis.com/youtube/v3";
export const YOUTUBE_ANALYTICS_API = "https://youtubeanalytics.googleapis.com/v2";

/** Data API v3 quota cost of each list call used here (the daily limit is 10,000). */
export const DATA_API_LIST_COST = 1;
export const VIDEOS_PER_REQUEST = 50;

export type YouTubeClientOptions = {
  accessToken: string;
  fetch?: FetchFn;
  retry?: RetryOptions;
};

export type AnalyticsQuery = {
  startDate: string;
  endDate: string;
  metrics: string[];
  dimensions?: string[];
  filters?: string;
  sort?: string;
  maxResults?: number;
};

/**
 * YouTube Data/Analytics API client. Every call is validated with Zod and
 * retried on 429/5xx. `quotaUnits` counts Data API units spent through it.
 */
export function createYouTubeClient({ accessToken, fetch: fetchFn = fetch, retry }: YouTubeClientOptions) {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  let quotaUnits = 0;

  function dataUrl(resource: string, params: Record<string, string>) {
    const url = new URL(`${YOUTUBE_DATA_API}/${resource}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.toString();
  }

  return {
    get quotaUnits() {
      return quotaUnits;
    },

    /** Channels of the consented Google account or brand account (usually one). */
    async listMyChannels(): Promise<Channel[]> {
      const url = dataUrl("channels", { part: "snippet,statistics,contentDetails", mine: "true" });
      const body = await requestJson(fetchFn, url, { headers }, channelListSchema, "youtube.channels.list", retry);
      quotaUnits += DATA_API_LIST_COST;
      return body.items ?? [];
    },

    /** One page (up to 50) of a playlist's video ids. */
    async listPlaylistVideoIds(playlistId: string, pageToken?: string): Promise<{ videoIds: string[]; nextPageToken?: string }> {
      const params: Record<string, string> = { part: "contentDetails", playlistId, maxResults: String(VIDEOS_PER_REQUEST) };
      if (pageToken) params.pageToken = pageToken;
      const body = await requestJson(
        fetchFn,
        dataUrl("playlistItems", params),
        { headers },
        playlistItemListSchema,
        "youtube.playlistItems.list",
        retry,
      );
      quotaUnits += DATA_API_LIST_COST;
      return { videoIds: (body.items ?? []).map((item) => item.contentDetails.videoId), nextPageToken: body.nextPageToken };
    },

    /** Details of up to 50 videos. Private or deleted ids are omitted by the API. */
    async listVideos(ids: string[]): Promise<Video[]> {
      if (ids.length === 0) return [];
      if (ids.length > VIDEOS_PER_REQUEST) throw new RangeError(`listVideos takes at most ${VIDEOS_PER_REQUEST} ids`);
      const url = dataUrl("videos", { part: "snippet,statistics,contentDetails", id: ids.join(","), maxResults: String(ids.length) });
      const body = await requestJson(fetchFn, url, { headers }, videoListSchema, "youtube.videos.list", retry);
      quotaUnits += DATA_API_LIST_COST;
      return body.items ?? [];
    },

    /** Analytics `reports.query` for the authorized channel. Uses its own quota, not Data API units. */
    async queryReport(query: AnalyticsQuery): Promise<AnalyticsReport> {
      const url = new URL(`${YOUTUBE_ANALYTICS_API}/reports`);
      url.searchParams.set("ids", "channel==MINE");
      url.searchParams.set("startDate", query.startDate);
      url.searchParams.set("endDate", query.endDate);
      url.searchParams.set("metrics", query.metrics.join(","));
      if (query.dimensions?.length) url.searchParams.set("dimensions", query.dimensions.join(","));
      if (query.filters) url.searchParams.set("filters", query.filters);
      if (query.sort) url.searchParams.set("sort", query.sort);
      if (query.maxResults) url.searchParams.set("maxResults", String(query.maxResults));
      return requestJson(fetchFn, url.toString(), { headers }, analyticsReportSchema, "youtubeAnalytics.reports.query", retry);
    },
  };
}

export type YouTubeClient = ReturnType<typeof createYouTubeClient>;
