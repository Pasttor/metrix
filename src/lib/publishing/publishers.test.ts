import { describe, expect, it, vi } from "vitest";
import fbFinish from "../../../tests/fixtures/publishing/fb-reel-finish.json";
import fbStart from "../../../tests/fixtures/publishing/fb-reel-start.json";
import fbComplete from "../../../tests/fixtures/publishing/fb-video-complete.json";
import fbProcessing from "../../../tests/fixtures/publishing/fb-video-processing.json";
import igContainer from "../../../tests/fixtures/publishing/ig-container.json";
import igPermalink from "../../../tests/fixtures/publishing/ig-permalink.json";
import igPublish from "../../../tests/fixtures/publishing/ig-publish.json";
import igError from "../../../tests/fixtures/publishing/ig-status-error.json";
import igFinished from "../../../tests/fixtures/publishing/ig-status-finished.json";
import igInProgress from "../../../tests/fixtures/publishing/ig-status-in-progress.json";
import igUpload from "../../../tests/fixtures/publishing/ig-upload.json";
import metaPermission from "../../../tests/fixtures/publishing/meta-error-permission.json";
import ttCreator from "../../../tests/fixtures/publishing/tt-creator-info.json";
import ttUnaudited from "../../../tests/fixtures/publishing/tt-error-unaudited.json";
import ttInit from "../../../tests/fixtures/publishing/tt-init.json";
import ttFailed from "../../../tests/fixtures/publishing/tt-status-failed.json";
import ttProcessing from "../../../tests/fixtures/publishing/tt-status-processing.json";
import ytForbidden from "../../../tests/fixtures/publishing/yt-error-forbidden.json";
import ytVideo from "../../../tests/fixtures/publishing/yt-video.json";
import { readFileSync } from "node:fs";
import { ReauthRequiredError } from "@/lib/oauth/token-store";
import { downloadDriveFile } from "./drive";
import { facebookPublisher, instagramPublisher } from "./meta-publishers";
import { chunkPlan, fetchCreatorInfo, tiktokPublisher } from "./tiktok-publisher";
import type { PublishContext, PublishJob } from "./types";
import { youtubePublisher, youtubeTitle } from "./youtube-publisher";

// Raw text: a JSON import would already round the 19-digit post id.
const ttCompleteText = readFileSync("tests/fixtures/publishing/tt-status-complete.json", "utf8");

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

type Route = (url: URL, init: RequestInit) => Response | undefined;

function setup(routes: Route[], overrides: Partial<PublishContext> = {}) {
  const calls: { method: string; url: URL; init: RequestInit }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({ method: init.method ?? "GET", url, init });
    for (const route of routes) {
      const response = route(url, init);
      if (response) return response;
    }
    throw new Error(`unexpected fetch ${init.method ?? "GET"} ${url.pathname}`);
  });
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  const downloadVideo = vi.fn(async () => bytes);
  const getAccessToken = vi.fn(async (_id: string, options?: { forceRefresh?: boolean }) => (options?.forceRefresh ? "fresh-token" : "token"));
  const ctx: PublishContext = {
    getAccessToken,
    downloadVideo,
    fetch: fetch as unknown as typeof globalThis.fetch,
    graphVersion: "v24.0",
    now: () => new Date("2026-11-09T18:00:00Z"),
    ...overrides,
  };
  return { ctx, calls, downloadVideo, getAccessToken };
}

const TIKTOK_CHOICES = { privacyLevel: "FOLLOWER_OF_CREATOR", allowComment: true, allowDuet: false, allowStitch: true, commercial: true, yourBrand: true, brandedContent: false };

function job(platform: PublishJob["platform"], state: Record<string, unknown> = {}): PublishJob {
  return {
    targetId: "t1",
    platform,
    accountId: "acc-1",
    externalAccountId: platform === "facebook" ? "page-1" : "ig-1",
    caption: "Mi primer reel\n#metrix",
    title: null,
    video: { driveFileId: "drive-1", name: "reel.mp4", mimeType: "video/mp4", sizeBytes: 5 },
    options: platform === "tiktok" ? TIKTOK_CHOICES : platform === "youtube" ? { privacy: "public", madeForKids: false } : {},
    state,
    attempts: 0,
  };
}

const is = (method: string, path: string) => (call: { method: string; url: URL }) => call.method === method && call.url.pathname.endsWith(path);

describe("Instagram publisher", () => {
  it("creates a resumable REELS container and uploads the bytes", async () => {
    const { ctx, calls } = setup([
      (url, init) => (init.method === "POST" && url.pathname === "/v24.0/ig-1/media" ? json(igContainer) : undefined),
      (url) => (url.hostname === "rupload.facebook.com" ? json(igUpload) : undefined),
    ]);
    const step = await instagramPublisher.advance(job("instagram"), ctx);
    expect(step).toEqual({ kind: "waiting", state: { containerId: igContainer.id }, checkAfterSeconds: 60 });

    const create = calls.find(is("POST", "/ig-1/media"))!;
    const body = new URLSearchParams(String(create.init.body));
    expect(body.get("media_type")).toBe("REELS");
    expect(body.get("upload_type")).toBe("resumable");
    expect(body.get("caption")).toBe("Mi primer reel\n#metrix");
    const upload = calls.find((call) => call.url.hostname === "rupload.facebook.com")!;
    expect((upload.init.headers as Record<string, string>).file_size).toBe("5");
    expect((upload.init.headers as Record<string, string>).Authorization).toBe("OAuth token");
  });

  it("keeps waiting while the container is IN_PROGRESS", async () => {
    const { ctx, downloadVideo } = setup([(url) => (url.pathname.endsWith(igContainer.id) ? json(igInProgress) : undefined)]);
    const step = await instagramPublisher.advance(job("instagram", { containerId: igContainer.id }), ctx);
    expect(step.kind).toBe("waiting");
    expect(downloadVideo).not.toHaveBeenCalled();
  });

  it("publishes a FINISHED container and reads the permalink", async () => {
    const { ctx } = setup([
      (url, init) => (init.method !== "POST" && url.pathname.endsWith(igContainer.id) ? json(igFinished) : undefined),
      (url, init) => (init.method === "POST" && url.pathname.endsWith("/media_publish") ? json(igPublish) : undefined),
      (url) => (url.pathname.endsWith(igPublish.id) ? json(igPermalink) : undefined),
    ]);
    const step = await instagramPublisher.advance(job("instagram", { containerId: igContainer.id }), ctx);
    expect(step).toEqual({ kind: "published", externalId: igPublish.id, permalink: igPermalink.permalink });
  });

  it("fails without retry when the container errors", async () => {
    const { ctx } = setup([(url) => (url.pathname.endsWith(igContainer.id) ? json(igError) : undefined)]);
    const step = await instagramPublisher.advance(job("instagram", { containerId: igContainer.id }), ctx);
    expect(step).toMatchObject({ kind: "failed", retryable: false });
    expect(step.kind === "failed" && step.error).toContain("ERROR");
  });

  it("explains a missing publish permission", async () => {
    const { ctx } = setup([(url) => (url.pathname.endsWith("/ig-1/media") ? json(metaPermission, 403) : undefined)]);
    const step = await instagramPublisher.advance(job("instagram"), ctx);
    expect(step).toMatchObject({ kind: "failed", retryable: false });
    expect(step.kind === "failed" && step.error).toContain("Reconecta Meta");
  });

  it("asks to reconnect when the token store needs reauth", async () => {
    const { ctx } = setup([], { getAccessToken: async () => Promise.reject(new ReauthRequiredError("acc-1")) });
    const step = await instagramPublisher.advance(job("instagram"), ctx);
    expect(step).toMatchObject({ kind: "failed", retryable: false });
    expect(step.kind === "failed" && step.error).toContain("Reconéctala");
  });
});

describe("Facebook publisher", () => {
  it("starts, uploads and finishes a Page Reel as PUBLISHED", async () => {
    const { ctx, calls } = setup([
      (url, init) => {
        if (init.method !== "POST" || !url.pathname.endsWith("/page-1/video_reels")) return undefined;
        return new URLSearchParams(String(init.body)).get("upload_phase") === "start" ? json(fbStart) : json(fbFinish);
      },
      (url) => (url.hostname === "rupload.facebook.com" ? json({ success: true }) : undefined),
    ]);
    const step = await facebookPublisher.advance(job("facebook"), ctx);
    expect(step).toEqual({ kind: "waiting", state: { videoId: fbStart.video_id }, checkAfterSeconds: 60 });
    const finish = calls.filter(is("POST", "/video_reels")).at(-1)!;
    const body = new URLSearchParams(String(finish.init.body));
    expect(body.get("video_state")).toBe("PUBLISHED");
    expect(body.get("description")).toBe("Mi primer reel\n#metrix");
  });

  it("waits while processing and publishes when complete", async () => {
    const processing = setup([(url) => (url.pathname.endsWith(fbStart.video_id) ? json(fbProcessing) : undefined)]);
    expect((await facebookPublisher.advance(job("facebook", { videoId: fbStart.video_id }), processing.ctx)).kind).toBe("waiting");

    const complete = setup([(url) => (url.pathname.endsWith(fbStart.video_id) ? json(fbComplete) : undefined)]);
    const step = await facebookPublisher.advance(job("facebook", { videoId: fbStart.video_id }), complete.ctx);
    expect(step).toEqual({ kind: "published", externalId: fbStart.video_id, permalink: "https://www.facebook.com/reel/1234567890123456/" });
  });
});

describe("YouTube publisher", () => {
  const SESSION = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=abc";

  it("uploads with the chosen visibility and says when Google keeps it private", async () => {
    const { ctx, calls } = setup([
      (url, init) => (init.method === "POST" && url.pathname === "/upload/youtube/v3/videos" ? new Response(null, { status: 200, headers: { Location: SESSION } }) : undefined),
      (url, init) => (init.method === "PUT" && url.searchParams.get("upload_id") === "abc" ? json(ytVideo) : undefined),
    ]);
    const step = await youtubePublisher.advance({ ...job("youtube"), title: "Mi video" }, ctx);
    expect(step).toMatchObject({ kind: "published", externalId: "dQw4w9WgXcQ", permalink: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    // The fixture comes back private (unaudited project) although public was requested.
    expect(step.kind === "published" && step.note).toContain("auditoría");

    const start = JSON.parse(String(calls[0].init.body));
    expect(start.status).toEqual({ privacyStatus: "public", selfDeclaredMadeForKids: false });
    expect(start.snippet.title).toBe("Mi video");
    expect((calls[0].init.headers as Record<string, string>)["X-Upload-Content-Length"]).toBe("5");
  });

  it("refreshes once when Google answers 401", async () => {
    let starts = 0;
    const { ctx, getAccessToken } = setup([
      (url, init) => {
        if (init.method !== "POST") return undefined;
        starts += 1;
        return starts === 1 ? json({ error: { status: "UNAUTHENTICATED" } }, 401) : new Response(null, { status: 200, headers: { Location: SESSION } });
      },
      (_url, init) => (init.method === "PUT" ? json(ytVideo) : undefined),
    ]);
    expect((await youtubePublisher.advance(job("youtube"), ctx)).kind).toBe("published");
    expect(getAccessToken).toHaveBeenLastCalledWith("acc-1", { forceRefresh: true });
  });

  it("explains a missing upload scope", async () => {
    const { ctx } = setup([(_url, init) => (init.method === "POST" ? json(ytForbidden, 403) : undefined)]);
    const step = await youtubePublisher.advance(job("youtube"), ctx);
    expect(step).toMatchObject({ kind: "failed", retryable: false });
    expect(step.kind === "failed" && step.error).toContain("Reconecta YouTube");
  });

  it("adds no note when YouTube keeps the requested visibility", async () => {
    const { ctx } = setup([
      (_url, init) => (init.method === "POST" ? new Response(null, { status: 200, headers: { Location: SESSION } }) : undefined),
      (_url, init) => (init.method === "PUT" ? json({ ...ytVideo, status: { privacyStatus: "unlisted" } }) : undefined),
    ]);
    const step = await youtubePublisher.advance({ ...job("youtube"), options: { privacy: "unlisted", madeForKids: true } }, ctx);
    expect(step).toEqual({ kind: "published", externalId: "dQw4w9WgXcQ", permalink: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
  });

  it("builds a valid title", () => {
    expect(youtubeTitle(null, "\n  Primera línea <b>\nresto", null)).toBe("Primera línea b");
    expect(youtubeTitle(null, "", "clip final.mp4")).toBe("clip final");
    expect(youtubeTitle("x".repeat(150), "", null)).toHaveLength(100);
  });
});

describe("TikTok publisher", () => {
  it("plans chunks within TikTok's limits", () => {
    expect(chunkPlan(3_000_000)).toEqual({ chunkSize: 3_000_000, count: 1 });
    expect(chunkPlan(64 * 1024 * 1024)).toEqual({ chunkSize: 64 * 1024 * 1024, count: 1 });
    const big = 105 * 1024 * 1024;
    const plan = chunkPlan(big);
    expect(plan.count).toBe(10);
    expect(big - plan.chunkSize * (plan.count - 1)).toBeLessThan(128 * 1024 * 1024);
  });

  it("inits a FILE_UPLOAD post with the user's choices and uploads the chunk", async () => {
    const { ctx, calls } = setup([
      (url) => (url.pathname.endsWith("/creator_info/query/") ? json(ttCreator) : undefined),
      (url) => (url.pathname.endsWith("/video/init/") ? json(ttInit) : undefined),
      (url, init) => (url.hostname === "open-upload.tiktokapis.com" && init.method === "PUT" ? new Response(null, { status: 201 }) : undefined),
    ]);
    const step = await tiktokPublisher.advance(job("tiktok"), ctx);
    expect(step).toEqual({ kind: "waiting", state: { publishId: ttInit.data.publish_id, privacyLevel: "FOLLOWER_OF_CREATOR" }, checkAfterSeconds: 60 });

    const init = JSON.parse(String(calls.find((call) => call.url.pathname.endsWith("/video/init/"))!.init.body));
    // Stitch was allowed by the user but the account disabled it (fixture): TikTok's setting wins.
    expect(init.post_info).toEqual({
      title: "Mi primer reel\n#metrix",
      privacy_level: "FOLLOWER_OF_CREATOR",
      disable_comment: false,
      disable_duet: true,
      disable_stitch: true,
      brand_content_toggle: false,
      brand_organic_toggle: true,
    });
    expect(init.source_info).toEqual({ source: "FILE_UPLOAD", video_size: 5, chunk_size: 5, total_chunk_count: 1 });
    const put = calls.find((call) => call.method === "PUT")!;
    expect((put.init.headers as Record<string, string>)["Content-Range"]).toBe("bytes 0-4/5");
  });

  it("never posts without the user's choices or with a privacy TikTok no longer allows", async () => {
    const { ctx, calls } = setup([(url) => (url.pathname.endsWith("/creator_info/query/") ? json(ttCreator) : undefined)]);
    const missing = await tiktokPublisher.advance({ ...job("tiktok"), options: {} }, ctx);
    expect(missing).toMatchObject({ kind: "failed", retryable: false });
    expect(calls).toHaveLength(0);

    const publicPost = await tiktokPublisher.advance({ ...job("tiktok"), options: { ...TIKTOK_CHOICES, privacyLevel: "PUBLIC_TO_EVERYONE" } }, ctx);
    expect(publicPost.kind === "failed" && publicPost.error).toContain("ya no acepta la privacidad");
    expect(calls.some((call) => call.url.pathname.endsWith("/video/init/"))).toBe(false);
  });

  it("reads the creator info the form shows", async () => {
    const { ctx } = setup([(url) => (url.pathname.endsWith("/creator_info/query/") ? json(ttCreator) : undefined)]);
    expect(await fetchCreatorInfo(ctx.fetch, "token")).toEqual({
      nickname: "Metrix",
      username: "metrix_test",
      avatarUrl: "https://p16.example/avatar.jpg",
      privacyOptions: ["FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"],
      commentDisabled: false,
      duetDisabled: false,
      stitchDisabled: true,
      maxDurationSec: 600,
    });
  });

  it("polls the status until PUBLISH_COMPLETE", async () => {
    const processing = setup([(url) => (url.pathname.endsWith("/status/fetch/") ? json(ttProcessing) : undefined)]);
    expect((await tiktokPublisher.advance(job("tiktok", { publishId: "p1" }), processing.ctx)).kind).toBe("waiting");

    const complete = setup([(url) => (url.pathname.endsWith("/status/fetch/") ? new Response(ttCompleteText, { headers: { "Content-Type": "application/json" } }) : undefined)]);
    expect(await tiktokPublisher.advance(job("tiktok", { publishId: "p1" }), complete.ctx)).toMatchObject({ kind: "published", externalId: "7300000000000000999" });

    const failed = setup([(url) => (url.pathname.endsWith("/status/fetch/") ? json(ttFailed) : undefined)]);
    const step = await tiktokPublisher.advance(job("tiktok", { publishId: "p1" }), failed.ctx);
    expect(step).toMatchObject({ kind: "failed", retryable: false });
    expect(step.kind === "failed" && step.error).toContain("duration_check_failed");
  });

  it("explains the unaudited-app restriction", async () => {
    const { ctx } = setup([
      (url) => (url.pathname.endsWith("/creator_info/query/") ? json(ttCreator) : undefined),
      (url) => (url.pathname.endsWith("/video/init/") ? json(ttUnaudited, 403) : undefined),
    ]);
    const step = await tiktokPublisher.advance(job("tiktok"), ctx);
    expect(step).toMatchObject({ kind: "failed", retryable: false });
    expect(step.kind === "failed" && step.error).toContain("aún no audita la app");
  });
});

describe("Drive download", () => {
  it("downloads the file bytes with the Google token", async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array([9, 8, 7]), { status: 200, headers: { "content-length": "3" } }));
    const bytes = await downloadDriveFile("drive-1", "token", fetch as unknown as typeof globalThis.fetch);
    expect([...bytes]).toEqual([9, 8, 7]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/drive/v3/files/drive-1?alt=media");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token");
  });

  it("explains a missing file", async () => {
    const fetch = vi.fn(async () => json({ error: { errors: [{ reason: "notFound" }] } }, 404));
    await expect(downloadDriveFile("gone", "token", fetch as unknown as typeof globalThis.fetch)).rejects.toThrow("No se encontró el video");
  });
});
