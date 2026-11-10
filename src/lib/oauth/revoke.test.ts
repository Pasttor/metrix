import { describe, expect, it, vi } from "vitest";
import { GOOGLE_REVOKE_URL, revokeAtProvider, TIKTOK_REVOKE_URL } from "./revoke";

function recorder(status = 200) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: new URLSearchParams(String(init?.body ?? "")) });
    return new Response(null, { status });
  });
  return { calls, fetchFn: fetchFn as unknown as typeof fetch };
}

describe("revokeAtProvider", () => {
  it("revokes the Google refresh token for YouTube and Drive", async () => {
    const { calls, fetchFn } = recorder();
    expect(await revokeAtProvider("youtube", { accessToken: "at", refreshToken: "rt" }, {}, fetchFn)).toBe(true);
    expect(await revokeAtProvider("drive", { accessToken: "at2", refreshToken: null }, {}, fetchFn)).toBe(true);
    expect(calls.map((call) => [call.url, call.body.get("token")])).toEqual([
      [GOOGLE_REVOKE_URL, "rt"],
      [GOOGLE_REVOKE_URL, "at2"],
    ]);
  });

  it("revokes TikTok with the client credentials", async () => {
    const { calls, fetchFn } = recorder();
    expect(await revokeAtProvider("tiktok", { accessToken: "at", refreshToken: "rt" }, { tiktokClientKey: "key", tiktokClientSecret: "secret" }, fetchFn)).toBe(true);
    expect(calls[0].url).toBe(TIKTOK_REVOKE_URL);
    expect(Object.fromEntries(calls[0].body)).toEqual({ client_key: "key", client_secret: "secret", token: "at" });
  });

  it("reports what it could not revoke", async () => {
    const { calls, fetchFn } = recorder(400);
    expect(await revokeAtProvider("youtube", { accessToken: "at", refreshToken: null }, {}, fetchFn)).toBe(false);
    expect(await revokeAtProvider("tiktok", { accessToken: "at", refreshToken: null }, {}, fetchFn)).toBe(false);
    expect(await revokeAtProvider("facebook", { accessToken: "at", refreshToken: null }, {}, fetchFn)).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
