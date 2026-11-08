import { handleBackfill } from "@/lib/sync/handlers";
import { backfillDeps } from "@/lib/sync/deps";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleBackfill(request, backfillDeps());
}
