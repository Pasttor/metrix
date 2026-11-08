import { HttpError } from "@/lib/platforms/http";
import { isMetaRejected, type MetaClient } from "./client";
import { insightsSchema, type Insights } from "./schemas";

/** 100:2108006: Instagram media published before the account became professional. */
export function isBeforeConversion(error: unknown): boolean {
  return error instanceof HttpError && /:100:2108006$/.test(error.code);
}

/** The object has no insights at all (not enough viewers, pre-conversion media): skip the item. */
export function isNoInsights(error: unknown): boolean {
  return isBeforeConversion(error) || (error instanceof HttpError && /^[A-Za-z]+:10(:|$)/.test(error.code));
}

/** Meta answered "must be a valid insights metric": the metric was retired. */
export function isRetiredMetric(error: unknown): boolean {
  return error instanceof HttpError && error.code.endsWith(":invalid_metric");
}

export type InsightsContext = {
  graph: MetaClient;
  warnings: Set<string>;
  /** Called once per retired metric (e.g. to flag it in metric_catalog). */
  onRetired?: (metric: string) => Promise<void>;
};

/**
 * Requests several metrics at once. One invalid metric fails the whole call
 * (#100), so it then retries metric by metric: only the bad one becomes a
 * warning and the rest are kept. Item-level refusals are rethrown.
 */
export async function fetchInsights(
  ctx: InsightsContext,
  path: string,
  params: Record<string, string>,
  metrics: string[],
  label: string,
): Promise<Insights> {
  try {
    return await ctx.graph.get(path, { ...params, metric: metrics.join(",") }, insightsSchema, "meta.insights");
  } catch (error) {
    if (!isMetaRejected(error) || isNoInsights(error)) throw error;
    if (metrics.length === 1) {
      if (isRetiredMetric(error)) {
        await ctx.onRetired?.(metrics[0]);
        ctx.warnings.add(`${label}: métrica ${metrics[0]} retirada por Meta`);
      } else {
        ctx.warnings.add(`${label}: métrica ${metrics[0]} rechazada por Meta (${error.code})`);
      }
      return { data: [] };
    }
  }
  const data: Insights["data"] = [];
  for (const metric of metrics) data.push(...(await fetchInsights(ctx, path, params, [metric], label)).data);
  return { data };
}
