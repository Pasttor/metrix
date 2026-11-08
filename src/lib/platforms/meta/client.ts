import type { z } from "zod";
import { errorCode, fetchWithRetry, HttpError, parseJson, type FetchFn, type RetryOptions } from "@/lib/platforms/http";
import { pagedSchema } from "./schemas";

export const GRAPH_HOST = "https://graph.facebook.com";
/** Safety cap when following `paging.next`. */
const MAX_PAGES = 50;
/** Above this share of Meta's rate limit, syncs stop and leave the rest for the next run. */
export const USAGE_LIMIT_PERCENT = 80;

export type MetaClientOptions = {
  version: string;
  accessToken: string;
  fetch?: FetchFn;
  retry?: RetryOptions;
};

/**
 * Highest usage percentage in `X-App-Usage` ({call_count,total_time,total_cputime})
 * and `X-Business-Use-Case-Usage` ({id: [{call_count,...,estimated_time_to_regain_access}]}).
 * A pending regain-access time counts as 100 %.
 */
export function usagePercent(headers: Headers): number {
  let max = 0;
  const scan = (entry: unknown) => {
    if (!entry || typeof entry !== "object") return;
    const record = entry as Record<string, unknown>;
    for (const key of ["call_count", "total_time", "total_cputime"]) {
      const value = Number(record[key]);
      if (Number.isFinite(value)) max = Math.max(max, value);
    }
    if (Number(record.estimated_time_to_regain_access) > 0) max = Math.max(max, 100);
  };
  for (const name of ["x-app-usage", "x-business-use-case-usage", "x-ad-account-usage"]) {
    const raw = headers.get(name);
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (name === "x-business-use-case-usage" && parsed && typeof parsed === "object") {
        for (const list of Object.values(parsed as Record<string, unknown>)) {
          if (Array.isArray(list)) list.forEach(scan);
        }
      } else {
        scan(parsed);
      }
    } catch {
      // Malformed header: ignore it rather than fail the sync.
    }
  }
  return max;
}

/**
 * Graph API client (Facebook Pages and Instagram via graph.facebook.com).
 * The token goes in the Authorization header, never in logged URLs; errors
 * carry only the status and Meta's error type/code.
 */
export function createMetaClient({ version, accessToken, fetch: fetchFn = fetch, retry }: MetaClientOptions) {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  let calls = 0;
  let usage = 0;

  function url(path: string, params: Record<string, string> = {}) {
    const result = new URL(`${GRAPH_HOST}/${version}/${path.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(params)) result.searchParams.set(key, value);
    return result.toString();
  }

  async function request<T extends z.ZodType>(target: string, schema: T, operation: string): Promise<z.infer<T>> {
    calls += 1;
    const response = await fetchWithRetry(fetchFn, target, { headers }, retry);
    usage = Math.max(usage, usagePercent(response.headers));
    if (!response.ok) throw new HttpError(response.status, await errorCode(response));
    return parseJson(response, schema, operation);
  }

  return {
    /** Graph calls made through this client. */
    get calls() {
      return calls;
    },
    /** Highest rate-limit usage (%) Meta reported to this client. */
    get usage() {
      return usage;
    },
    get overLimit() {
      return usage >= USAGE_LIMIT_PERCENT;
    },

    get<T extends z.ZodType>(path: string, params: Record<string, string>, schema: T, operation: string) {
      return request(url(path, params), schema, operation);
    },

    /** Follows `paging.next` and returns every item of an edge. */
    async getAll<T extends z.ZodType>(path: string, params: Record<string, string>, item: T, operation: string): Promise<z.infer<T>[]> {
      const schema = pagedSchema(item);
      const items: z.infer<T>[] = [];
      let page = await request(url(path, params), schema, operation);
      for (let i = 1; ; i++) {
        items.push(...page.data);
        if (!page.paging?.next || i >= MAX_PAGES) return items;
        // `next` already carries the cursor and fields; the header still authenticates it.
        page = await request(page.paging.next, schema, operation);
      }
    },
  };
}

export type MetaClient = ReturnType<typeof createMetaClient>;

/** Meta auth failures: expired/revoked token (190) or a 401. */
export function isMetaAuthError(error: unknown): boolean {
  return error instanceof HttpError && (error.status === 401 || /^OAuthException:190(:|$)/.test(error.code));
}

/** A metric or field the API rejects for this object (bad request, code 100). */
export function isMetaRejected(error: unknown): error is HttpError {
  return error instanceof HttpError && error.status === 400 && /:100(:|$)/.test(error.code);
}
