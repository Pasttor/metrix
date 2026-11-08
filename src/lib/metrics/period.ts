import { addDays, daysBetween } from "@/lib/dates";

/** A reporting window and the window of the same length right before it (inclusive dates). */
export type Period = { start: string; end: string; previousStart: string; previousEnd: string; days: number };

export function periodEndingOn(end: string, days: number): Period {
  const start = addDays(end, -(days - 1));
  const previousEnd = addDays(start, -1);
  return { start, end, previousStart: addDays(previousEnd, -(days - 1)), previousEnd, days };
}

export function datesOf(start: string, end: string): string[] {
  const count = daysBetween(start, end) + 1;
  return Array.from({ length: Math.max(0, count) }, (_, i) => addDays(start, i));
}

/** Relative change, or null when there is nothing to compare against. */
export function relativeChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}
