import { handleCron } from "@/lib/sync/handlers";
import { cronDeps } from "@/lib/sync/deps";

// Vercel Cron calls this daily with "Authorization: Bearer ${CRON_SECRET}".
export const maxDuration = 300;

export async function GET(request: Request) {
  return handleCron(request, "youtube", cronDeps());
}
