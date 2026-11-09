import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { NetworkOverview } from "@/lib/metrics/unified-data";
import { formatChange, formatNumber, formatPercent, formatShortDate } from "@/lib/format";
import { NetworkIcon } from "./network-icon";

function Delta({ value, kind }: { value: number | null; kind: "relative" | "points" | "count" }) {
  if (value === null) return <span className="text-xs text-muted-foreground">sin comparación</span>;
  const direction = Math.abs(value) < 1e-9 ? "flat" : value > 0 ? "up" : "down";
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  const tone =
    direction === "up" ? "text-emerald-700 dark:text-emerald-400" : direction === "down" ? "text-red-700 dark:text-red-400" : "text-muted-foreground";
  const text = kind === "count" ? `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatNumber(Math.abs(value))}` : formatChange(value, kind);
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${tone}`}>
      <Icon aria-hidden className="size-3.5" />
      <span className="sr-only">{direction === "up" ? "subió" : direction === "down" ? "bajó" : "sin cambio"}</span>
      {text}
    </span>
  );
}

function Metric({ label, value, delta }: { label: string; value: string; delta: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      {delta}
    </div>
  );
}

/** One row of KPIs per network; a network without an account offers to connect it. */
export function NetworkSummary({ networks }: { networks: NetworkOverview[] }) {
  return (
    <section aria-label="Resumen por red" className="grid gap-3 md:grid-cols-2">
      {networks.map((network) => (
        <div key={network.platform} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <header className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-semibold">
              <NetworkIcon platform={network.platform} /> {network.label}
            </span>
            {network.connected ? (
              <span className="truncate text-xs text-muted-foreground">
                {network.name} · al {formatShortDate(network.period.end)}
              </span>
            ) : null}
          </header>
          {network.connected ? (
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Seguidores" value={formatNumber(network.summary.followers)} delta={<Delta value={network.summary.followersChange} kind="count" />} />
              <Metric
                label="Vistas"
                value={formatNumber(network.summary.views, { compact: true })}
                delta={<Delta value={network.summary.viewsChange} kind="relative" />}
              />
              <Metric label="Engagement" value={formatPercent(network.summary.engagement)} delta={<Delta value={network.summary.engagementChange} kind="points" />} />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Todavía no está conectada.</p>
              <Link href="/settings/connections" className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                Conectar
              </Link>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
