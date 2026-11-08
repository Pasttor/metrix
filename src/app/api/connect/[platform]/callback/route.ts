import type { NextRequest } from "next/server";
import { connectDeps } from "@/lib/oauth/deps";
import { finishConnect } from "@/lib/oauth/flow";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/connect/[platform]/callback">) {
  const { platform } = await ctx.params;
  return finishConnect(platform, request.nextUrl.searchParams, connectDeps());
}
