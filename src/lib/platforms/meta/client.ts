import type { z } from "zod";
import { requestJson, type FetchFn, type RetryOptions } from "@/lib/platforms/http";
import { pagedSchema } from "./schemas";

export const GRAPH_HOST = "https://graph.facebook.com";
/** Safety cap when following `paging.next`. */
const MAX_PAGES = 50;

export type MetaClientOptions = {
  version: string;
  accessToken: string;
  fetch?: FetchFn;
  retry?: RetryOptions;
};

/**
 * Graph API client (Facebook Pages and Instagram via graph.facebook.com).
 * The token goes in the Authorization header, never in logged URLs; errors
 * carry only the status and Meta's error type/code.
 */
export function createMetaClient({ version, accessToken, fetch: fetchFn = fetch, retry }: MetaClientOptions) {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  let calls = 0;

  function url(path: string, params: Record<string, string> = {}) {
    const result = new URL(`${GRAPH_HOST}/${version}/${path.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(params)) result.searchParams.set(key, value);
    return result.toString();
  }

  async function get<T extends z.ZodType>(path: string, params: Record<string, string>, schema: T, operation: string) {
    calls += 1;
    return requestJson(fetchFn, url(path, params), { headers }, schema, operation, retry);
  }

  return {
    /** Graph calls made through this client (Meta rate limits count calls). */
    get calls() {
      return calls;
    },
    get,

    /** Follows `paging.next` and returns every item of an edge. */
    async getAll<T extends z.ZodType>(path: string, params: Record<string, string>, item: T, operation: string): Promise<z.infer<T>[]> {
      const schema = pagedSchema(item);
      const items: z.infer<T>[] = [];
      let page = await get(path, params, schema, operation);
      for (let i = 1; ; i++) {
        items.push(...page.data);
        if (!page.paging?.next || i >= MAX_PAGES) return items;
        calls += 1;
        // `next` already carries the cursor and fields; the header still authenticates it.
        page = await requestJson(fetchFn, page.paging.next, { headers }, schema, operation, retry);
      }
    },
  };
}

export type MetaClient = ReturnType<typeof createMetaClient>;
