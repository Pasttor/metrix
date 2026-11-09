import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Meta webhooks (Instagram `story_insights`): subscription check, signature
 * validation and parsing. Meta sends a story's final insights when it
 * expires, after 24 hours; the daily sync only sees stories while they are live.
 */

/** GET verification: echo `hub.challenge` only for our verify token. */
export function verifySubscription(params: URLSearchParams, verifyToken: string | undefined): string | null {
  if (!verifyToken) return null;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token") ?? "";
  const challenge = params.get("hub.challenge");
  if (mode !== "subscribe" || challenge === null) return null;
  const a = Buffer.from(token);
  const b = Buffer.from(verifyToken);
  return a.length === b.length && timingSafeEqual(a, b) ? challenge : null;
}

/** `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256 of the raw body with the app secret. */
export function isValidSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const received = Buffer.from(header.slice("sha256=".length), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

const webhookSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string(),
      time: z.number().optional(),
      changes: z.array(z.object({ field: z.string(), value: z.record(z.string(), z.unknown()) })).optional(),
    }),
  ),
});

export type StoryInsight = {
  /** Instagram user id (accounts.external_id). */
  igUserId: string;
  /** Story media id (posts.external_id). */
  mediaId: string;
  /** When Meta sent it (seconds), or null. */
  time: number | null;
  metrics: { metric: string; value: number }[];
};

/** Navigation taps Meta reports separately; their sum is the `navigation` metric. */
const NAVIGATION_PARTS = ["taps_forward", "taps_back", "exits", "swipe_forward"];

/**
 * Every `story_insights` change as metrics: each numeric field as-is (reach,
 * replies, taps_forward, taps_back, exits, views/impressions...) plus their
 * `navigation` total. Unknown objects and other fields are ignored.
 */
export function parseStoryInsights(payload: unknown): StoryInsight[] {
  const parsed = webhookSchema.safeParse(payload);
  if (!parsed.success || parsed.data.object !== "instagram") return [];
  return parsed.data.entry.flatMap((entry) =>
    (entry.changes ?? []).flatMap((change) => {
      if (change.field !== "story_insights") return [];
      const mediaId = change.value.media_id;
      if (typeof mediaId !== "string" && typeof mediaId !== "number") return [];
      const metrics = Object.entries(change.value).flatMap(([metric, value]) =>
        metric !== "media_id" && typeof value === "number" && Number.isFinite(value) ? [{ metric, value }] : [],
      );
      const parts = metrics.filter((row) => NAVIGATION_PARTS.includes(row.metric));
      if (parts.length > 0) metrics.push({ metric: "navigation", value: parts.reduce((sum, row) => sum + row.value, 0) });
      return [{ igUserId: entry.id, mediaId: String(mediaId), time: entry.time ?? null, metrics }];
    }),
  );
}

export type WebhookStore = {
  findAccountId(igUserId: string): Promise<string | null>;
  /** Existing post id for the story, or a new minimal story post. */
  ensureStoryPost(accountId: string, mediaId: string, publishedAt: string | null): Promise<string>;
  upsertPostMetrics(capturedOn: string, rows: { postId: string; metric: string; value: number }[]): Promise<number>;
};

/**
 * Applies the final story metrics. Idempotent: the same payload twice upserts
 * the same rows. Stories of accounts Metrix does not know are skipped.
 */
export async function processStoryInsights(
  insights: StoryInsight[],
  store: WebhookStore,
  capturedOn: string,
): Promise<{ applied: { postId: string; mediaId: string; metrics: StoryInsight["metrics"] }[]; skipped: number }> {
  const applied: { postId: string; mediaId: string; metrics: StoryInsight["metrics"] }[] = [];
  let skipped = 0;
  for (const insight of insights) {
    const accountId = await store.findAccountId(insight.igUserId);
    if (!accountId || insight.metrics.length === 0) {
      skipped += 1;
      continue;
    }
    // The story was published ~24 h before Meta sends its final numbers.
    const publishedAt = insight.time ? new Date((insight.time - 86_400) * 1000).toISOString() : null;
    const postId = await store.ensureStoryPost(accountId, insight.mediaId, publishedAt);
    await store.upsertPostMetrics(capturedOn, insight.metrics.map((row) => ({ postId, ...row })));
    applied.push({ postId, mediaId: insight.mediaId, metrics: insight.metrics });
  }
  return { applied, skipped };
}

/** An in-app event for each story whose final insights arrived (one per story). */
export function storyNotifications(applied: { postId: string; mediaId: string; metrics: StoryInsight["metrics"] }[]) {
  return applied.map(({ postId, mediaId, metrics }) => {
    const value = (name: string) => metrics.find((row) => row.metric === name)?.value;
    const parts = [
      ["alcance", value("reach")],
      ["vistas", value("views") ?? value("impressions")],
      ["respuestas", value("replies")],
      ["navegación", value("navigation")],
    ].flatMap(([label, n]) => (typeof n === "number" ? [`${label} ${n.toLocaleString("es-MX")}`] : []));
    return {
      kind: "story_insights",
      severity: "info" as const,
      title: "Llegaron las métricas finales de una historia",
      message: parts.length ? `Instagram: ${parts.join(" · ")}.` : "Instagram envió las métricas finales de una historia.",
      href: `/instagram/posts/${postId}`,
      dedupe_key: `story:${mediaId}`,
    };
  });
}
