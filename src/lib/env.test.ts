import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const validEnv = {
  APP_URL: "http://localhost:3000",
  ALLOWED_EMAIL: "owner@example.com",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  CRON_SECRET: "a-long-enough-cron-secret",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

describe("parseEnv", () => {
  it("accepts the required variables and applies defaults", () => {
    const env = parseEnv(validEnv);
    expect(env.REPORT_TIMEZONE).toBe("America/Mexico_City");
    expect(env.META_GRAPH_VERSION).toBe("v26.0");
    expect(env.YOUTUBE_MONETARY).toBe(false);
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it("parses YOUTUBE_MONETARY as a boolean", () => {
    expect(parseEnv({ ...validEnv, YOUTUBE_MONETARY: "true" }).YOUTUBE_MONETARY).toBe(true);
  });

  it("treats empty strings as missing", () => {
    expect(() => parseEnv({ ...validEnv, CRON_SECRET: "" })).toThrow(/CRON_SECRET/);
    expect(parseEnv({ ...validEnv, GOOGLE_CLIENT_ID: "" }).GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it("fails when a required variable is missing", () => {
    const rest: Record<string, string> = { ...validEnv };
    delete rest.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => parseEnv(rest)).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("rejects an encryption key that is not 32 bytes", () => {
    const shortKey = Buffer.alloc(16, 1).toString("base64");
    expect(() => parseEnv({ ...validEnv, TOKEN_ENCRYPTION_KEY: shortKey })).toThrow(
      /TOKEN_ENCRYPTION_KEY/,
    );
  });

  it("never includes secret values in the error message", () => {
    const secret = "qwxz-secret";
    try {
      parseEnv({ ...validEnv, CRON_SECRET: secret });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).toMatch(/CRON_SECRET/);
      expect(String(error)).not.toContain(secret);
    }
  });
});
