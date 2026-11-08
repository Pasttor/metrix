import type { NextRequest } from "next/server";
import { connectDeps } from "@/lib/oauth/deps";
import { startConnect } from "@/lib/oauth/flow";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/connect/[platform]">) {
  const { platform } = await ctx.params;
  return startConnect(platform, connectDeps());
}
