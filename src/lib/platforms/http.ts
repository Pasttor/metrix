import type { z } from "zod";

/**
 * Shared HTTP helpers for platform clients: retries with exponential backoff on
 * 429/5xx and network errors, and Zod validation of JSON bodies. Errors carry the
 * status and a short code only, never URLs (they can hold tokens) or bodies.
 */

export type FetchFn = typeof fetch;

export type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`HTTP ${status}${code ? ` (${code})` : ""}`);
    this.name = "HttpError";
  }
}

export class ResponseShapeError extends Error {
  constructor(readonly operation: string) {
    super(`Unexpected response shape from ${operation}`);
    this.name = "ResponseShapeError";
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRetryable(status: number) {
  return status === 429 || status >= 500;
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? Math.min(seconds * 1000, 30_000) : null;
}

export async function fetchWithRetry(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit = {},
  { retries = 3, baseDelayMs = 500, sleep = defaultSleep }: RetryOptions = {},
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetchFn(url, init);
    } catch (error) {
      if (attempt >= retries) throw error;
      await sleep(baseDelayMs * 2 ** attempt);
      continue;
    }
    if (!isRetryable(response.status) || attempt >= retries) return response;
    await response.body?.cancel().catch(() => undefined);
    await sleep(retryAfterMs(response) ?? baseDelayMs * 2 ** attempt);
  }
}

type ErrorBody = {
  error?:
    | string
    | { status?: unknown; errors?: { reason?: unknown }[]; type?: unknown; code?: unknown; error_subcode?: unknown; message?: unknown };
};

/**
 * Reads a short code from a provider error body without exposing the rest:
 * OAuth bodies use `error: "invalid_grant"`, Google APIs use
 * `error: { errors: [{ reason }], status }`, Meta uses
 * `error: { type, code, error_subcode }` (→ "OAuthException:190:463"). A Meta
 * "not a valid insights metric" answer gets an ":invalid_metric" tag (retired metric);
 * the message itself is never kept.
 */
export async function errorCode(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as ErrorBody | null;
  const error = body?.error;
  if (typeof error === "string") return error.slice(0, 64);
  const reason = error?.errors?.[0]?.reason;
  if (typeof reason === "string") return reason.slice(0, 64);
  if (typeof error?.status === "string") return error.status.slice(0, 64);
  // TikTok: error: { code: "access_token_invalid", message, log_id }.
  if (typeof (error as { code?: unknown } | undefined)?.code === "string" && error?.type === undefined) {
    return String((error as { code: string }).code).slice(0, 64);
  }
  if (typeof error?.type === "string") {
    const parts = [error.type, error.code, error.error_subcode].filter((part) => typeof part === "string" || typeof part === "number");
    if (typeof error.message === "string" && /valid insights metric/i.test(error.message)) parts.push("invalid_metric");
    return parts.join(":").slice(0, 64);
  }
  return "";
}

export async function parseJson<T extends z.ZodType>(response: Response, schema: T, operation: string): Promise<z.infer<T>> {
  const body: unknown = await response.json().catch(() => {
    throw new ResponseShapeError(operation);
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ResponseShapeError(operation);
  return parsed.data;
}

/** Fetches with retries, throws HttpError on a non-2xx and validates the body. */
export async function requestJson<T extends z.ZodType>(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
  schema: T,
  operation: string,
  retry?: RetryOptions,
): Promise<z.infer<T>> {
  const response = await fetchWithRetry(fetchFn, url, init, retry);
  if (!response.ok) throw new HttpError(response.status, await errorCode(response));
  return parseJson(response, schema, operation);
}
