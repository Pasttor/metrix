import { describe, expect, it } from "vitest";
import { formatChange, formatDuration, formatHours, formatNumber, formatPercent, formatShortDate, formatValue, NO_DATA } from "./format";

describe("format", () => {
  it("shows missing values as a dash, never as zero", () => {
    expect(formatNumber(null)).toBe(NO_DATA);
    expect(formatPercent(null)).toBe(NO_DATA);
    expect(formatDuration(null)).toBe(NO_DATA);
    expect(formatHours(null)).toBe(NO_DATA);
  });

  it("formats numbers, hours, durations and percents in es-MX", () => {
    expect(formatNumber(15230)).toBe("15,230");
    expect(formatNumber(152300, { compact: true })).toMatch(/^152\.3\s?(k|mil)$/);
    expect(formatHours(12.34)).toBe("12.3 h");
    expect(formatDuration(725)).toBe("12:05");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatPercent(7.5)).toBe("7.5 %");
  });

  it("formats calendar dates without shifting the day", () => {
    expect(formatShortDate("2026-11-06")).toBe("6 nov");
    expect(formatShortDate("2026-01-01", true)).toBe("1 ene 2026");
  });

  it("formats values by kind, including milliseconds as a duration", () => {
    expect(formatValue(13432, "milliseconds")).toBe("0:13");
    expect(formatValue(44.7, "percent")).toBe("44.7 %");
    expect(formatValue(null, "count")).toBe(NO_DATA);
  });

  it("formats changes with sign and kind", () => {
    expect(formatChange(0.123, "relative")).toBe("+12.3 %");
    expect(formatChange(-0.5, "relative")).toBe("−50 %");
    expect(formatChange(0.42, "points")).toBe("+0.4 pts");
    expect(formatChange(0, "relative")).toBe("0.0 %");
  });
});
