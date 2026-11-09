import { dateInTimeZone } from "@/lib/dates";
import type { Json } from "@/lib/db/types";
import type { NotificationRow } from "@/lib/alerts";
import { isValidSignature, parseStoryInsights, processStoryInsights, storyNotifications, verifySubscription, type WebhookStore } from "./webhook";

export type WebhookDeps = {
  appSecret: string | undefined;
  verifyToken: string | undefined;
  reportTimeZone: string;
  store: WebhookStore;
  saveEvent: (payload: Json) => Promise<string>;
  finishEvent: (id: string, error: string | null) => Promise<void>;
  /** In-app events (story insights received). */
  notify?: (rows: NotificationRow[]) => Promise<void>;
  /** Runs work after the response is sent (next/server `after` in production). */
  defer: (task: () => Promise<void>) => void;
  now?: () => Date;
  log?: (message: string) => void;
};

export function handleWebhookVerification(request: Request, deps: Pick<WebhookDeps, "verifyToken">): Response {
  const challenge = verifySubscription(new URL(request.url).searchParams, deps.verifyToken);
  return challenge === null ? new Response("Forbidden", { status: 403 }) : new Response(challenge, { status: 200 });
}

/**
 * Validates the signature on the raw body, stores the event and answers 200
 * right away; story insights are applied after the response. An invalid
 * signature gets 401 and nothing is stored.
 */
export async function handleWebhookEvent(request: Request, deps: WebhookDeps): Promise<Response> {
  const log = deps.log ?? ((message: string) => console.warn(message));
  if (!deps.appSecret) return new Response("Not configured", { status: 503 });

  const rawBody = await request.text();
  if (!isValidSignature(rawBody, request.headers.get("x-hub-signature-256"), deps.appSecret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: Json;
  try {
    payload = JSON.parse(rawBody) as Json;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventId = await deps.saveEvent(payload);
  deps.defer(async () => {
    try {
      const capturedOn = dateInTimeZone(deps.now?.() ?? new Date(), deps.reportTimeZone);
      const { applied } = await processStoryInsights(parseStoryInsights(payload), deps.store, capturedOn);
      if (applied.length > 0) await deps.notify?.(storyNotifications(applied));
      await deps.finishEvent(eventId, null);
    } catch (error) {
      const reason = error instanceof Error ? error.name : "unknown";
      log(`[webhook:meta] processing failed: ${reason}`);
      await deps.finishEvent(eventId, reason).catch(() => undefined);
    }
  });
  return new Response("OK", { status: 200 });
}
