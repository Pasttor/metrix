import { requestJson, type FetchFn, type RetryOptions } from "@/lib/platforms/http";
import { channelListSchema, type Channel } from "./schemas";

export const YOUTUBE_DATA_API = "https://www.googleapis.com/youtube/v3";

export type YouTubeClientOptions = {
  accessToken: string;
  fetch?: FetchFn;
  retry?: RetryOptions;
};

/** YouTube Data/Analytics API client. Every call is validated with Zod and retried on 429/5xx. */
export function createYouTubeClient({ accessToken, fetch: fetchFn = fetch, retry }: YouTubeClientOptions) {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };

  return {
    /** Channels of the consented Google account or brand account (usually one). Costs 1 quota unit. */
    async listMyChannels(): Promise<Channel[]> {
      const url = new URL(`${YOUTUBE_DATA_API}/channels`);
      url.searchParams.set("part", "snippet,statistics,contentDetails");
      url.searchParams.set("mine", "true");
      const body = await requestJson(fetchFn, url.toString(), { headers }, channelListSchema, "youtube.channels.list", retry);
      return body.items ?? [];
    },
  };
}

export type YouTubeClient = ReturnType<typeof createYouTubeClient>;
