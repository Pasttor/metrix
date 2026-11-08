/** Reporting period, in days, kept in the URL as `?range=`. */
export const RANGE_OPTIONS = [7, 28, 90, 365] as const;

export type Range = (typeof RANGE_OPTIONS)[number];

export const DEFAULT_RANGE: Range = 28;

export const RANGE_PARAM = "range";

export function parseRange(value: string | string[] | null | undefined): Range {
  const raw = Array.isArray(value) ? value[0] : value;
  const days = Number(raw);
  return (RANGE_OPTIONS as readonly number[]).includes(days) ? (days as Range) : DEFAULT_RANGE;
}

/** Adds the current range to an internal link so it survives navigation. */
export function withRange(href: string, range: Range): string {
  if (range === DEFAULT_RANGE) return href;
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set(RANGE_PARAM, String(range));
  return `${path}?${params.toString()}`;
}
