import { describe, expect, it } from "vitest";
import { authCodeRedirect, decideAccess, isAllowedEmail, isPublicPath, safeNextPath } from "./access";

const allowedEmail = "owner@example.com";
const base = { search: "", allowedEmail };

describe("decideAccess", () => {
  it("sends visitors without a session to /login from any dashboard route", () => {
    for (const pathname of ["/youtube", "/instagram", "/facebook", "/tiktok", "/settings"]) {
      expect(decideAccess({ ...base, pathname, email: null })).toEqual({
        action: "redirect",
        to: `/login?next=${encodeURIComponent(pathname)}`,
      });
    }
  });

  it("redirects the home page to a plain /login", () => {
    expect(decideAccess({ ...base, pathname: "/", email: null })).toEqual({
      action: "redirect",
      to: "/login",
    });
  });

  it("keeps the query string in the next param", () => {
    expect(decideAccess({ ...base, pathname: "/youtube", search: "?range=90", email: null })).toEqual({
      action: "redirect",
      to: `/login?next=${encodeURIComponent("/youtube?range=90")}`,
    });
  });

  it("lets the allowed email in, case-insensitively", () => {
    expect(decideAccess({ ...base, pathname: "/youtube", email: "Owner@Example.com" })).toEqual({
      action: "next",
    });
  });

  it("rejects a session with another email even after completing the magic link", () => {
    expect(decideAccess({ ...base, pathname: "/", email: "intruder@example.com" })).toEqual({
      action: "unauthorized",
    });
    expect(decideAccess({ ...base, pathname: "/login", email: "intruder@example.com" })).toEqual({
      action: "unauthorized",
    });
  });

  it("lets the auth callback finish for any session", () => {
    expect(decideAccess({ ...base, pathname: "/auth/confirm", email: "intruder@example.com" })).toEqual({
      action: "next",
    });
  });

  it("sends a signed-in allowed user away from /login", () => {
    expect(decideAccess({ ...base, pathname: "/login", email: allowedEmail })).toEqual({
      action: "redirect",
      to: "/",
    });
  });

  it("leaves /login and API routes public", () => {
    expect(decideAccess({ ...base, pathname: "/login", email: null })).toEqual({ action: "next" });
    expect(decideAccess({ ...base, pathname: "/api/cron/sync-youtube", email: null })).toEqual({
      action: "next",
    });
  });
});

describe("isPublicPath", () => {
  it("opens the about and privacy pages to everyone (Google and Meta check them)", () => {
    expect(isPublicPath("/acerca")).toBe(true);
    expect(isPublicPath("/privacidad")).toBe(true);
    expect(isPublicPath("/terminos")).toBe(true);
    expect(decideAccess({ ...base, pathname: "/privacidad", email: null })).toEqual({ action: "next" });
    expect(decideAccess({ ...base, pathname: "/privacidad", email: "someone@example.com" })).toEqual({ action: "next" });
    expect(isPublicPath("/privacidad-admin")).toBe(false);
  });

  it("does not treat look-alike paths as public", () => {
    expect(isPublicPath("/login-admin")).toBe(false);
    expect(isPublicPath("/authors")).toBe(false);
    expect(isPublicPath("/api")).toBe(false);
  });
});

describe("isAllowedEmail", () => {
  it("rejects missing emails", () => {
    expect(isAllowedEmail(null, allowedEmail)).toBe(false);
    expect(isAllowedEmail("", allowedEmail)).toBe(false);
  });
});

describe("authCodeRedirect", () => {
  it("forwards a magic link code that landed on the Site URL", () => {
    expect(authCodeRedirect("/", new URLSearchParams("code=abc"))).toBe("/auth/confirm?code=abc&next=%2F");
  });

  it("keeps a safe next param", () => {
    expect(authCodeRedirect("/", new URLSearchParams("code=abc&next=/youtube"))).toBe(
      "/auth/confirm?code=abc&next=%2Fyoutube",
    );
    expect(authCodeRedirect("/", new URLSearchParams("code=abc&next=//evil.example"))).toBe(
      "/auth/confirm?code=abc&next=%2F",
    );
  });

  it("ignores requests without a code and the callback itself", () => {
    expect(authCodeRedirect("/", new URLSearchParams(""))).toBeNull();
    expect(authCodeRedirect("/auth/confirm", new URLSearchParams("code=abc"))).toBeNull();
    expect(authCodeRedirect("/api/connect/youtube/callback", new URLSearchParams("code=abc"))).toBeNull();
  });
});

describe("safeNextPath", () => {
  it("only allows same-site relative paths", () => {
    expect(safeNextPath("/youtube?range=7")).toBe("/youtube?range=7");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
