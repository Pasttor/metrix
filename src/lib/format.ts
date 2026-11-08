const DEFAULT_TIMEZONE = "America/Mexico_City";

/** Date and time in Spanish (Mexico), in the reporting time zone. */
export function formatDateTime(iso: string, timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}
