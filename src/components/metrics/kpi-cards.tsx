import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Kpi } from "@/lib/metrics/youtube";
import { formatChange, formatDuration, formatHours, formatNumber, formatPercent } from "@/lib/format";

function formatValue(kpi: Kpi): string {
  switch (kpi.format) {
    case "hours":
      return formatHours(kpi.value);
    case "duration":
      return formatDuration(kpi.value);
    case "percent":
      return formatPercent(kpi.value);
    default:
      return formatNumber(kpi.value);
  }
}

function Change({ kpi }: { kpi: Kpi }) {
  if (kpi.change === null) {
    return <span className="text-xs text-muted-foreground">Sin periodo anterior para comparar</span>;
  }
  const direction = Math.abs(kpi.change) < 1e-9 ? "flat" : kpi.change > 0 ? "up" : "down";
  // Status color always comes with an icon and the signed text, never color alone.
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  const tone =
    direction === "up"
      ? "text-emerald-700 dark:text-emerald-400"
      : direction === "down"
        ? "text-red-700 dark:text-red-400"
        : "text-muted-foreground";
  const label = direction === "up" ? "subió" : direction === "down" ? "bajó" : "sin cambio";
  return (
    <span className="flex items-center gap-1 text-xs">
      <span className={`flex items-center gap-0.5 font-medium ${tone}`}>
        <Icon aria-hidden className="size-3.5" />
        <span className="sr-only">{label}</span>
        {formatChange(kpi.change, kpi.changeKind)}
      </span>
      <span className="text-muted-foreground">vs periodo anterior</span>
    </span>
  );
}

export function KpiCards({ kpis }: { kpis: Kpi[] }) {
  return (
    <section aria-label="Indicadores del periodo" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {kpis.map((kpi) => (
        <div key={kpi.key} className="flex flex-col gap-1.5 rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">{kpi.label}</p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatValue(kpi)}</p>
          <Change kpi={kpi} />
        </div>
      ))}
    </section>
  );
}
