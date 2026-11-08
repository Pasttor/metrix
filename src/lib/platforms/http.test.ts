import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { errorCode, fetchWithRetry, HttpError, requestJson, ResponseShapeError } from "./http";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const noSleep = { sleep: vi.fn(async () => undefined) };

describe("fetchWithRetry", () => {
  it("retries 429 and 5xx with exponential backoff, then returns", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 429))
      .mockResolvedValueOnce(json({}, 500))
      .mockResolvedValueOnce(json({ ok: true }));
    const response = await fetchWithRetry(fetchFn, "https://api.test/x", {}, { sleep, baseDelayMs: 100 });
    expect(response.status).toBe(200);
    expect(sleep.mock.calls).toEqual([[100], [200]]);
  });

  it("honors Retry-After in seconds", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(json({}, 429, { "retry-after": "2" })).mockResolvedValueOnce(json({}));
    await fetchWithRetry(fetchFn, "https://api.test/x", {}, { sleep });
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("does not retry 4xx and gives up after the retry budget", async () => {
    const fourHundred = vi.fn<typeof fetch>().mockResolvedValue(json({}, 400));
    expect((await fetchWithRetry(fourHundred, "https://api.test/x", {}, noSleep)).status).toBe(400);
    expect(fourHundred).toHaveBeenCalledTimes(1);

    const alwaysDown = vi.fn<typeof fetch>().mockImplementation(async () => json({}, 503));
    expect((await fetchWithRetry(alwaysDown, "https://api.test/x", {}, { ...noSleep, retries: 2 })).status).toBe(503);
    expect(alwaysDown).toHaveBeenCalledTimes(3);
  });

  it("retries network errors and rethrows the last one", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    await expect(fetchWithRetry(fetchFn, "https://api.test/x", {}, { ...noSleep, retries: 1 })).rejects.toThrow("fetch failed");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe("errorCode", () => {
  it("reads OAuth and Google API error codes", async () => {
    expect(await errorCode(json({ error: "invalid_grant", error_description: "secret detail" }))).toBe("invalid_grant");
    expect(await errorCode(json({ error: { status: "PERMISSION_DENIED", errors: [{ reason: "quotaExceeded" }] } }))).toBe(
      "quotaExceeded",
    );
    expect(await errorCode(json({ error: { status: "UNAUTHENTICATED" } }))).toBe("UNAUTHENTICATED");
    expect(
      await errorCode(json({ error: { message: "Error validating access token: secret", type: "OAuthException", code: 190, error_subcode: 463, fbtrace_id: "x" } })),
    ).toBe("OAuthException:190:463");
    expect(await errorCode(new Response("not json"))).toBe("");
  });
});

describe("requestJson", () => {
  const schema = z.object({ value: z.number() });

  it("validates the body", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({ value: 1 }));
    expect(await requestJson(fetchFn, "https://api.test/x", {}, schema, "test.op")).toEqual({ value: 1 });
  });

  it("throws ResponseShapeError on an unexpected body and HttpError on a failed status", async () => {
    await expect(
      requestJson(vi.fn<typeof fetch>().mockResolvedValue(json({ value: "1" })), "https://api.test/x", {}, schema, "test.op"),
    ).rejects.toBeInstanceOf(ResponseShapeError);

    const error = await requestJson(
      vi.fn<typeof fetch>().mockResolvedValue(json({ error: { errors: [{ reason: "forbidden" }] } }, 403)),
      "https://api.test/x?access_token=leak",
      {},
      schema,
      "test.op",
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 403, code: "forbidden" });
    expect((error as Error).message).not.toContain("leak");
  });
});
