import type { ShareRow } from "@/lib/metrics/youtube-content";
import { formatNumber, formatPercent } from "@/lib/format";

/** Ranked horizontal bars as plain HTML: every bar is labeled, so the values never depend on color or hover. */
export function ShareBars({ rows, valueLabel = "vistas" }: { rows: ShareRow[]; valueLabel?: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Sin datos todavía.</p>;
  const max = Math.max(...rows.map((row) => row.share));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <li key={row.key} className="grid gap-1 text-sm" title={`${row.label}: ${formatNumber(row.value)} ${valueLabel}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate">{row.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{formatPercent(row.share * 100)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted">
            <div className="h-full rounded-full bg-chart-1" style={{ width: `${max ? (row.share / max) * 100 : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
