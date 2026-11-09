import { handleWebhookEvent, handleWebhookVerification } from "@/lib/platforms/meta/webhook-handler";
import { webhookDeps } from "@/lib/platforms/meta/webhook-deps";

/** Meta webhook (Instagram story_insights). Public route: Meta's signature authenticates it. */
export async function GET(request: Request) {
  return handleWebhookVerification(request, webhookDeps());
}

export async function POST(request: Request) {
  return handleWebhookEvent(request, webhookDeps());
}
