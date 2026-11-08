import { describe, expect, it } from "vitest";
import { DEFAULT_RANGE, parseRange, withRange } from "./range";

describe("parseRange", () => {
  it("accepts the supported periods", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange("28")).toBe(28);
    expect(parseRange("90")).toBe(90);
    expect(parseRange("365")).toBe(365);
  });

  it("falls back to 28 days for missing or invalid values", () => {
    expect(parseRange(null)).toBe(DEFAULT_RANGE);
    expect(parseRange(undefined)).toBe(DEFAULT_RANGE);
    expect(parseRange("30")).toBe(DEFAULT_RANGE);
    expect(parseRange("abc")).toBe(DEFAULT_RANGE);
  });

  it("uses the first value when the param is repeated", () => {
    expect(parseRange(["90", "7"])).toBe(90);
  });
});

describe("withRange", () => {
  it("keeps the default period out of the URL", () => {
    expect(withRange("/youtube", 28)).toBe("/youtube");
  });

  it("adds a non-default period", () => {
    expect(withRange("/youtube", 90)).toBe("/youtube?range=90");
  });

  it("preserves existing query params", () => {
    expect(withRange("/youtube?tab=videos", 7)).toBe("/youtube?tab=videos&range=7");
  });
});
