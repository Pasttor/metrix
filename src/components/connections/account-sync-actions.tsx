"use client";

import { useState, useTransition } from "react";
import { syncNow } from "@/app/(dashboard)/settings/connections/actions";
import { Button } from "@/components/ui/button";

type BackfillResponse = { done?: boolean; progress?: number; status?: string; error?: string };

const MAX_BLOCKS = 200;

export function AccountSyncActions({ accountId, enabled }: { accountId: string; enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const busy = pending || progress !== null;
  const disabledTitle = enabled ? undefined : "Disponible cuando esta red tenga sincronizador";

  function onSyncNow() {
    setMessage(null);
    startTransition(async () => {
      const result = await syncNow(accountId);
      setMessage(result.message);
    });
  }

  async function onBackfill() {
    setMessage(null);
    setProgress(0);
    try {
      // Each call processes one block and saves a cursor; repeat until done.
      for (let block = 0; block < MAX_BLOCKS; block++) {
        const response = await fetch("/api/sync/backfill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId }),
        });
        const body = (await response.json().catch(() => ({}))) as BackfillResponse;
        if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
        if (body.status === "skipped") {
          setMessage("Esta red todavía no tiene sincronizador.");
          return;
        }
        setProgress(body.progress ?? 0);
        if (body.done) {
          setMessage(body.status === "success" ? "Historial cargado." : "Historial cargado con errores. Revisa Salud.");
          return;
        }
      }
      setMessage("El historial sigue cargando; vuelve a intentarlo para continuar.");
    } catch {
      setMessage("No se pudo cargar el historial.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!enabled || busy} title={disabledTitle} onClick={onSyncNow}>
          {pending ? "Sincronizando…" : "Sincronizar ahora"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={!enabled || busy} title={disabledTitle} onClick={onBackfill}>
          Cargar historial
        </Button>
      </div>
      {progress !== null ? (
        <div
          role="progressbar"
          aria-label="Progreso del historial"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="h-1.5 w-40 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      ) : null}
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
