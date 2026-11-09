import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckCircle2, CircleAlert, CircleX, Loader2 } from "lucide-react";
import { Section } from "@/components/metrics/section";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { formatDateTime, formatNumber } from "@/lib/format";
import { getHealth, HEALTH_PLATFORMS, HEALTH_RUNS, type HealthRun } from "@/lib/metrics/health-data";

export const metadata: Metadata = { title: "Salud · Metrix" };

const STATUS: Record<string, { label: string; icon: typeof CheckCircle2; tone: string }> = {
  success: { label: "Correcta", icon: CheckCircle2, tone: "text-emerald-700 dark:text-emerald-400" },
  partial: { label: "Parcial", icon: CircleAlert, tone: "text-amber-700 dark:text-amber-400" },
  error: { label: "Error", icon: CircleX, tone: "text-red-700 dark:text-red-400" },
  running: { label: "En curso", icon: Loader2, tone: "text-muted-foreground" },
};
const JOBS: Record<string, string> = { daily: "Diario", backfill: "Historial", webhook: "Webhook" };
const ACCOUNT_STATUS: Record<string, string> = { active: "Conectada", reauth_required: "Necesita reconectarse" };

function RunStatus({ status }: { status: string }) {
  const meta = STATUS[status] ?? STATUS.running;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${meta.tone}`}>
      <Icon aria-hidden className="size-4" /> {meta.label}
    </span>
  );
}

function RunsTable({ runs }: { runs: HealthRun[] }) {
  if (runs.length === 0) return <p className="text-sm text-muted-foreground">Sin corridas todavía.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b bg-muted/40 text-left text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Inicio</th>
            <th scope="col" className="px-3 py-2 font-medium">Tipo</th>
            <th scope="col" className="px-3 py-2 font-medium">Estado</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Duración</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Filas</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Llamadas</th>
            <th scope="col" className="px-3 py-2 font-medium">Avisos y errores</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const notes = [...run.errors.map((text) => `Error: ${text}`), ...run.warnings];
            return (
              <tr key={run.id} className="border-b align-top last:border-b-0">
                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(run.startedAt)}</td>
                <td className="px-3 py-2">{JOBS[run.job] ?? run.job}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <RunStatus status={run.status} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{run.durationSeconds === null ? "—" : `${run.durationSeconds.toFixed(1)} s`}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(run.rowsWritten)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(run.quota)}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {notes.length === 0 ? (
                    "—"
                  ) : (
                    <details>
                      <summary className="cursor-pointer">{notes.length} aviso(s)</summary>
                      <ul className="mt-1 list-disc pl-4">
                        {notes.map((note, i) => (
                          <li key={i}>{note}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

async function Health() {
  const health = await getHealth();
  return (
    <>
      <Section title="Cuentas" description="Estado de cada cuenta conectada y su último sync completo.">
        {health.accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay cuentas conectadas.</p>
        ) : (
          <ul className="flex flex-col divide-y text-sm">
            {health.accounts.map((account) => (
              <li key={`${account.platform}-${account.name}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="capitalize">
                  {account.platform} <span className="normal-case text-muted-foreground">{account.name}</span>
                </span>
                <span className="flex items-center gap-3 text-muted-foreground">
                  <span className={account.status === "active" ? "" : "font-medium text-red-700 dark:text-red-400"}>
                    {ACCOUNT_STATUS[account.status] ?? account.status}
                  </span>
                  <span>Último sync: {account.lastSyncedAt ? formatDateTime(account.lastSyncedAt) : "nunca"}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {HEALTH_PLATFORMS.map((platform) => (
        <Section key={platform.key} title={platform.label} description={`Últimas ${HEALTH_RUNS} corridas.`}>
          <RunsTable runs={health.runs[platform.key] ?? []} />
        </Section>
      ))}
    </>
  );
}

export default function HealthPage() {
  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Salud</h1>
          <p className="text-sm text-muted-foreground">
            Corridas de sincronización y estado de las cuentas. Si una cuenta necesita reconectarse o una corrida falla, Metrix te avisa por correo (como
            máximo un correo por cuenta al día).
          </p>
        </div>
        <SettingsTabs active="/settings/health" />
      </header>
      {/* Reads the session, so it renders at request time. */}
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Health />
      </Suspense>
    </>
  );
}
