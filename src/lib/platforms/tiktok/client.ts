import { HttpError, requestJson, ResponseShapeError, type FetchFn, type RetryOptions } from "@/lib/platforms/http";
import { userInfoSchema, videoListSchema, type TikTokUser, type TikTokVideo } from "./schemas";

export const TIKTOK_API = "https://open.tiktokapis.com/v2";
export const VIDEOS_PER_PAGE = 20;

/** Fields per scope: TikTok rejects fields the user did not grant. */
export const USER_FIELDS = {
  "user.info.basic": ["open_id", "union_id", "avatar_url", "display_name"],
  "user.info.profile": ["username"],
  "user.info.stats": ["follower_count", "following_count", "likes_count", "video_count"],
} as const;

export const VIDEO_FIELDS = [
  "id",
  "title",
  "video_description",
  "create_time",
  "cover_image_url",
  "share_url",
  "duration",
  "view_count",
  "like_count",
  "comment_count",
  "share_count",
];

export function userFieldsFor(scopes: string[] | null): string[] {
  // Without the granted list, ask for everything and let the caller fall back.
  const granted = scopes ?? Object.keys(USER_FIELDS);
  return Object.entries(USER_FIELDS).flatMap(([scope, fields]) => (granted.includes(scope) ? [...fields] : []));
}

/** TikTok can answer 200 with `error.code` other than "ok". */
function ensureOk(body: { error?: { code: string } }, status = 200) {
  if (body.error && body.error.code !== "ok") throw new HttpError(status === 200 ? 400 : status, body.error.code);
}

export function createTikTokClient({ accessToken, fetch: fetchFn = fetch, retry }: { accessToken: string; fetch?: FetchFn; retry?: RetryOptions }) {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  let calls = 0;

  return {
    get calls() {
      return calls;
    },

    async userInfo(fields: string[]): Promise<TikTokUser> {
      calls += 1;
      const url = new URL(`${TIKTOK_API}/user/info/`);
      url.searchParams.set("fields", fields.join(","));
      const body = await requestJson(fetchFn, url.toString(), { headers }, userInfoSchema, "tiktok.user.info", retry);
      ensureOk(body);
      if (!body.data?.user) throw new ResponseShapeError("tiktok.user.info");
      return body.data.user;
    },

    async listVideos(cursor?: number): Promise<{ videos: TikTokVideo[]; cursor?: number; hasMore: boolean }> {
      calls += 1;
      const url = new URL(`${TIKTOK_API}/video/list/`);
      url.searchParams.set("fields", VIDEO_FIELDS.join(","));
      const body = await requestJson(
        fetchFn,
        url.toString(),
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(cursor === undefined ? { max_count: VIDEOS_PER_PAGE } : { max_count: VIDEOS_PER_PAGE, cursor }),
        },
        videoListSchema,
        "tiktok.video.list",
        retry,
      );
      ensureOk(body);
      return { videos: body.data?.videos ?? [], cursor: body.data?.cursor, hasMore: Boolean(body.data?.has_more) };
    },
  };
}

export type TikTokClient = ReturnType<typeof createTikTokClient>;
