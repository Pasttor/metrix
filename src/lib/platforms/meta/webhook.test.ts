import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import storyInsights from "../../../../tests/fixtures/meta/webhook-story-insights.json";
import type { Json } from "@/lib/db/types";
import { isValidSignature, parseStoryInsights, verifySubscription, type WebhookStore } from "./webhook";
import { handleWebhookEvent, handleWebhookVerification, type WebhookDeps } from "./webhook-handler";

const SECRET = "app-secret";
const sign = (body: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

function setup(options: { knownAccount?: boolean; existingPost?: boolean } = {}) {
  const events: Json[] = [];
  const finished: { id: string; error: string | null }[] = [];
  const metrics = new Map<string, number>();
  const posts = new Map<string, { accountId: string; publishedAt: string | null }>();
  if (options.existingPost) posts.set("18000000000000009", { accountId: "acc-ig", publishedAt: "2026-11-07T10:00:00Z" });
  const deferred: (() => Promise<void>)[] = [];
  const store: WebhookStore = {
    findAccountId: async (igUserId) => ((options.knownAccount ?? true) && igUserId === "17841400000000001" ? "acc-ig" : null),
    ensureStoryPost: async (accountId, mediaId, publishedAt) => {
      if (!posts.has(mediaId)) posts.set(mediaId, { accountId, publishedAt });
      return `post-${mediaId}`;
    },
    upsertPostMetrics: async (capturedOn, rows) => {
      for (const row of rows) metrics.set(`${row.postId}|${capturedOn}|${row.metric}`, row.value);
      return rows.length;
    },
  };
  const deps: WebhookDeps = {
    appSecret: SECRET,
    verifyToken: "verify-me",
    reportTimeZone: "America/Mexico_City",
    store,
    saveEvent: vi.fn(async (payload: Json) => {
      events.push(payload);
      return `evt-${events.length}`;
    }),
    finishEvent: async (id, error) => {
      finished.push({ id, error });
    },
    defer: (task) => {
      deferred.push(task);
    },
    now: () => new Date("2026-11-09T18:00:00Z"),
  };
  const post = (body: string, signature: string | null) =>
    handleWebhookEvent(
      new Request("https://metrix.test/api/webhooks/meta", { method: "POST", body, headers: signature ? { "x-hub-signature-256": signature } : {} }),
      deps,
    );
  const flush = async () => {
    while (deferred.length) await deferred.shift()!();
  };
  return { deps, events, finished, metrics, posts, post, flush };
}

describe("subscription check", () => {
  it("echoes the challenge only for our verify token", () => {
    const params = (token: string) => new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": token, "hub.challenge": "1158201444" });
    expect(verifySubscription(params("verify-me"), "verify-me")).toBe("1158201444");
    expect(verifySubscription(params("wrong"), "verify-me")).toBeNull();
    expect(verifySubscription(params("verify-me"), undefined)).toBeNull();
  });

  it("answers the GET with the challenge or 403", async () => {
    const ok = handleWebhookVerification(
      new Request("https://metrix.test/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42"),
      { verifyToken: "verify-me" },
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("42");
    expect(handleWebhookVerification(new Request("https://metrix.test/api/webhooks/meta?hub.mode=subscribe"), { verifyToken: "verify-me" }).status).toBe(403);
  });
});

describe("signature", () => {
  it("accepts the HMAC of the exact raw body and rejects anything else", () => {
    const body = JSON.stringify(storyInsights);
    expect(isValidSignature(body, sign(body), SECRET)).toBe(true);
    expect(isValidSignature(`${body} `, sign(body), SECRET)).toBe(false);
    expect(isValidSignature(body, sign(body, "other"), SECRET)).toBe(false);
    expect(isValidSignature(body, null, SECRET)).toBe(false);
    expect(isValidSignature(body, "sha256=zz", SECRET)).toBe(false);
  });
});

describe("parseStoryInsights", () => {
  it("reads every numeric field and adds the navigation total", () => {
    const [insight] = parseStoryInsights(storyInsights);
    expect(insight).toMatchObject({ igUserId: "17841400000000001", mediaId: "18000000000000009" });
    expect(Object.fromEntries(insight.metrics.map((row) => [row.metric, row.value]))).toEqual({
      impressions: 444,
      reach: 44,
      taps_forward: 4,
      taps_back: 3,
      exits: 3,
      replies: 0,
      navigation: 10,
    });
  });

  it("ignores other objects and fields", () => {
    expect(parseStoryInsights({ object: "page", entry: [] })).toEqual([]);
    expect(parseStoryInsights({ object: "instagram", entry: [{ id: "1", changes: [{ field: "comments", value: { id: "x" } }] }] })).toEqual([]);
    expect(parseStoryInsights("nope")).toEqual([]);
  });
});

describe("POST /api/webhooks/meta", () => {
  const body = JSON.stringify(storyInsights);

  it("stores a correctly signed event, answers 200 and applies the final story metrics after responding", async () => {
    const t = setup();
    const response = await t.post(body, sign(body));
    expect(response.status).toBe(200);
    expect(t.events).toHaveLength(1);
    expect(t.metrics.size).toBe(0); // processed after the response

    await t.flush();
    expect(t.metrics.get("post-18000000000000009|2026-11-09|reach")).toBe(44);
    expect(t.metrics.get("post-18000000000000009|2026-11-09|navigation")).toBe(10);
    expect(t.finished).toEqual([{ id: "evt-1", error: null }]);
    // Story not seen by the daily sync: created, published ~24 h before Meta's time.
    expect(t.posts.get("18000000000000009")).toEqual({ accountId: "acc-ig", publishedAt: new Date((1794200000 - 86400) * 1000).toISOString() });
  });

  it("rejects an invalid signature with 401 and stores nothing", async () => {
    const t = setup();
    expect((await t.post(body, sign(body, "attacker"))).status).toBe(401);
    expect((await t.post(body, null)).status).toBe(401);
    expect(t.events).toHaveLength(0);
    await t.flush();
    expect(t.metrics.size).toBe(0);
  });

  it("is idempotent when Meta delivers the same event twice", async () => {
    const t = setup({ existingPost: true });
    await t.post(body, sign(body));
    await t.flush();
    const first = new Map(t.metrics);
    await t.post(body, sign(body));
    await t.flush();
    expect(t.metrics).toEqual(first);
    expect(t.posts.get("18000000000000009")?.publishedAt).toBe("2026-11-07T10:00:00Z"); // existing post untouched
  });

  it("records the event but skips stories of unknown accounts", async () => {
    const t = setup({ knownAccount: false });
    expect((await t.post(body, sign(body))).status).toBe(200);
    await t.flush();
    expect(t.metrics.size).toBe(0);
    expect(t.finished).toEqual([{ id: "evt-1", error: null }]);
  });

  it("answers 503 without an app secret", async () => {
    const t = setup();
    t.deps.appSecret = undefined;
    expect((await t.post(body, sign(body))).status).toBe(503);
  });
});
