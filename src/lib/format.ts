import type { ValueFormat } from "@/lib/metrics/posts";

const DEFAULT_TIMEZONE = "America/Mexico_City";
const LOCALE = "es-MX";

/** Date and time in Spanish (Mexico), in the reporting time zone. */
export function formatDateTime(iso: string, timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}

const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 });
const oneDecimal = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** Placeholder for a missing value ("sin datos" is never shown as 0). */
export const NO_DATA = "—";

export function formatNumber(value: number | null, options: { compact?: boolean } = {}): string {
  if (value === null) return NO_DATA;
  return options.compact && Math.abs(value) >= 10_000 ? compact.format(value) : integer.format(value);
}

export function formatPercent(value: number | null, fractionDigits = 1): string {
  if (value === null) return NO_DATA;
  return `${value.toLocaleString(LOCALE, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })} %`;
}

export function formatHours(hours: number | null): string {
  if (hours === null) return NO_DATA;
  return hours < 100 ? `${oneDecimal.format(hours)} h` : `${integer.format(hours)} h`;
}

/** Seconds as m:ss (or h:mm:ss). */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return NO_DATA;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** A `YYYY-MM-DD` calendar date as "6 nov" (or "6 nov 2025" with the year). */
export function formatShortDate(isoDate: string, withYear = false): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(year, month - 1, day)))
    .replace(".", "");
}

/** A timestamp as a calendar date in the reporting time zone ("2 nov 2026"). */
export function formatDate(iso: string, timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone })
    .format(new Date(iso))
    .replace(".", "");
}

/** "+12.3 %" for relative changes, "+0.4 pts" for rate changes. */
export function formatChange(change: number, kind: "relative" | "points"): string {
  const sign = change > 0 ? "+" : change < 0 ? "−" : "";
  const magnitude = Math.abs(kind === "relative" ? change * 100 : change);
  const text = magnitude.toLocaleString(LOCALE, { maximumFractionDigits: 1, minimumFractionDigits: magnitude < 10 ? 1 : 0 });
  return kind === "relative" ? `${sign}${text} %` : `${sign}${text} pts`;
}

/** A metric value in the given format; missing values show as "—". */
export function formatValue(value: number | null, format: ValueFormat): string {
  if (value === null) return NO_DATA;
  switch (format) {
    case "percent":
      return formatPercent(value);
    case "duration":
      return formatDuration(value);
    case "milliseconds":
      return formatDuration(value / 1000);
    default:
      return formatNumber(value);
  }
}
