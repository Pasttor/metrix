import { describe, expect, it } from "vitest";
import { addDays, dateInTimeZone, daysBetween, isMonday, minDate } from "./dates";

describe("dates", () => {
  it("gives the calendar date in a time zone", () => {
    const instant = new Date("2026-11-09T04:30:00Z");
    expect(dateInTimeZone(instant, "UTC")).toBe("2026-11-09");
    expect(dateInTimeZone(instant, "America/Mexico_City")).toBe("2026-11-08");
    expect(dateInTimeZone(instant, "America/Los_Angeles")).toBe("2026-11-08");
  });

  it("adds days across months and leap years", () => {
    expect(addDays("2026-11-08", -7)).toBe("2026-11-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("counts days, picks the earliest date and detects Mondays", () => {
    expect(daysBetween("2026-01-01", "2027-01-01")).toBe(365);
    expect(daysBetween("2026-01-02", "2026-01-01")).toBe(-1);
    expect(minDate("2026-01-02", "2025-12-31")).toBe("2025-12-31");
    expect(isMonday("2026-11-09")).toBe(true);
    expect(isMonday("2026-11-08")).toBe(false);
  });
});
