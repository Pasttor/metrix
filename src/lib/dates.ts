/** Calendar dates as `YYYY-MM-DD` strings (the `date` columns), independent of the server time zone. */

const DAY_MS = 86_400_000;

/** The calendar date of `instant` in `timeZone`. */
export function dateInTimeZone(instant: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

function toUtcMs(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function addDays(isoDate: string, days: number): string {
  return new Date(toUtcMs(isoDate) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

export function isMonday(isoDate: string): boolean {
  return new Date(toUtcMs(isoDate)).getUTCDay() === 1;
}
