import { describe, expect, it, vi } from "vitest";
import type { NotificationRow } from "@/lib/alerts";
import { MAX_ATTEMPTS, MAX_WAIT_MS, nextUpdate, postStatus, runPublish, type ClaimedTarget, type PublishStore, type TargetUpdate } from "./runner";
import type { PublishPlatform, PublishStep, Publisher } from "./types";

const NOW = new Date("2026-11-09T18:00:00Z");

function target(overrides: Partial<ClaimedTarget> = {}): ClaimedTarget {
  return {
    id: "t-ig",
    postId: "post-1",
    platform: "instagram",
    accountId: "acc-ig",
    externalAccountId: "ig-1",
    caption: "Nuevo reel",
    title: null,
    state: {},
    attempts: 0,
    video: { driveFileId: "drive-1", name: "a.mp4", mimeType: "video/mp4", sizeBytes: 3 },
    ...overrides,
  };
}

function memoryStore(targets: ClaimedTarget[]) {
  const saved = new Map<string, TargetUpdate>();
  const settled: string[][] = [];
  const store: PublishStore = {
    claimDue: vi.fn(async () => targets),
    saveTarget: vi.fn(async (id: string, update: TargetUpdate) => void saved.set(id, update)),
    settlePosts: vi.fn(async (ids: string[]) => void settled.push(ids)),
  };
  return { store, saved, settled };
}

function publisher(step: PublishStep | ((ctx: Parameters<Publisher["advance"]>[1]) => Promise<PublishStep>)): Publisher {
  return { advance: vi.fn(async (_job, ctx) => (typeof step === "function" ? step(ctx) : step)) };
}

function deps(store: PublishStore, publishers: Partial<Record<PublishPlatform, Publisher>>, extra: { fetch?: typeof fetch; driveAccount?: string | null } = {}) {
  const notified: NotificationRow[] = [];
  const idle = publisher({ kind: "failed", error: "no", retryable: false });
  return {
    notified,
    deps: {
      store,
      publishers: { youtube: idle, instagram: idle, facebook: idle, tiktok: idle, ...publishers },
      getAccessToken: vi.fn(async () => "token"),
      getDriveAccountId: async () => (extra.driveAccount === undefined ? "acc-drive" : extra.driveAccount),
      notify: async (rows: NotificationRow[]) => void notified.push(...rows),
      fetch: extra.fetch,
      graphVersion: "v24.0",
      now: () => NOW,
      deadline: new Date(NOW.getTime() + 60_000),
    },
  };
}

describe("postStatus", () => {
  it("summarizes the targets", () => {
    expect(postStatus(["published", "published"])).toBe("done");
    expect(postStatus(["published", "failed"])).toBe("partial");
    expect(postStatus(["failed", "canceled"])).toBe("failed");
    expect(postStatus(["processing", "published"])).toBe("publishing");
    expect(postStatus(["canceled"])).toBe("canceled");
  });
});

describe("nextUpdate", () => {
  it("schedules a retry for retryable failures, then gives up", () => {
    const first = nextUpdate(target(), { kind: "failed", error: "Instagram respondió 500.", retryable: true }, NOW);
    expect(first).toMatchObject({ status: "pending", attempts: 1, next_check_at: "2026-11-09T18:10:00.000Z" });

    const last = nextUpdate(target({ attempts: MAX_ATTEMPTS - 1 }), { kind: "failed", error: "Instagram respondió 500.", retryable: true }, NOW);
    expect(last).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS, error: "Instagram respondió 500." });
  });

  it("gives up on a network that keeps processing", () => {
    const since = new Date(NOW.getTime() - MAX_WAIT_MS - 1000).toISOString();
    const update = nextUpdate(target({ state: { containerId: "c1", waitingSince: since } }), { kind: "waiting", state: { containerId: "c1", waitingSince: since }, checkAfterSeconds: 60 }, NOW);
    expect(update.status).toBe("failed");
  });
});

describe("runPublish", () => {
  it("advances every target, saves, settles and notifies", async () => {
    const { store, saved, settled } = memoryStore([target(), target({ id: "t-fb", platform: "facebook", accountId: "acc-fb", externalAccountId: "page-1" })]);
    const { deps: d, notified } = deps(store, {
      instagram: publisher({ kind: "published", externalId: "m1", permalink: "https://instagram.com/reel/x" }),
      facebook: publisher({ kind: "waiting", state: { videoId: "v1" }, checkAfterSeconds: 60 }),
    });
    const result = await runPublish(d);

    expect(result).toMatchObject({ claimed: 2, published: 1, waiting: 1, failed: 0 });
    expect(saved.get("t-ig")).toMatchObject({ status: "published", external_id: "m1", published_at: NOW.toISOString() });
    expect(saved.get("t-fb")).toMatchObject({ status: "processing", state: { videoId: "v1", waitingSince: NOW.toISOString() } });
    expect(settled).toEqual([["post-1"]]);
    expect(notified).toEqual([expect.objectContaining({ kind: "publish_done", title: "Publicado en Instagram", dedupe_key: "publish:t-ig:published" })]);
  });

  it("downloads the video once per post, only when a publisher asks", async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    const { store } = memoryStore([target(), target({ id: "t-fb", platform: "facebook" }), target({ id: "t-tt", platform: "tiktok", state: { publishId: "p" } })]);
    const uses = async (ctx: Parameters<Publisher["advance"]>[1]): Promise<PublishStep> => {
      await ctx.downloadVideo();
      return { kind: "waiting", state: { x: 1 }, checkAfterSeconds: 60 };
    };
    const { deps: d } = deps(store, { instagram: publisher(uses), facebook: publisher(uses), tiktok: publisher({ kind: "waiting", state: {}, checkAfterSeconds: 60 }) }, { fetch: fetch as unknown as typeof globalThis.fetch });
    await runPublish(d);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fails targets whose account is gone and when Drive is not connected", async () => {
    const { store, saved } = memoryStore([target({ accountId: null, externalAccountId: null }), target({ id: "t-fb", platform: "facebook" })]);
    const { deps: d, notified } = deps(
      store,
      {
        facebook: publisher(async (ctx) => {
          try {
            await ctx.downloadVideo();
            return { kind: "published", externalId: "x", permalink: null };
          } catch (error) {
            return { kind: "failed", error: (error as Error).message, retryable: false };
          }
        }),
      },
      { driveAccount: null },
    );
    const result = await runPublish(d);
    expect(result.failed).toBe(2);
    expect(saved.get("t-ig")?.error).toContain("ya no está conectada");
    expect(saved.get("t-fb")?.error).toContain("Conecta Google Drive");
    expect(notified.every((row) => row.kind === "publish_failed" && row.severity === "error")).toBe(true);
  });

  it("leaves the remaining targets for the next run when out of time", async () => {
    const { store, saved } = memoryStore([target()]);
    const { deps: d } = deps(store, {});
    const result = await runPublish({ ...d, deadline: new Date(NOW.getTime() - 1) });
    expect(result.skipped).toBe(1);
    expect(saved.size).toBe(0);
  });
});
