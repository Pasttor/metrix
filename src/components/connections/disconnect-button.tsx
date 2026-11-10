"use client";

import { useState, useTransition } from "react";
import { disconnectAccount } from "@/app/(dashboard)/settings/connections/actions";
import { Button } from "@/components/ui/button";

/** Two-step "disconnect and delete": revokes access and deletes everything stored for the account. */
export function DisconnectButton({ accountId }: { accountId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function onConfirm() {
    startTransition(async () => {
      const result = await disconnectAccount(accountId);
      setMessage(result.message);
      setConfirming(false);
    });
  }

  if (message) return <p className="max-w-xs text-right text-xs text-muted-foreground">{message}</p>;

  if (!confirming) {
    return (
      <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirming(true)}>
        Desconectar y borrar datos
      </Button>
    );
  }

  return (
    <div role="alertdialog" aria-label="Confirmar desconexión" className="flex max-w-xs flex-col items-end gap-2 rounded-lg border p-3 text-right">
      <p className="text-xs">
        Se quita el acceso de Metrix y se borran sus métricas, publicaciones y tokens guardados. No se puede deshacer. Si YouTube y Drive usan la
        misma cuenta de Google, Google quita el acceso de ambos.
      </p>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
          Cancelar
        </Button>
        <Button type="button" size="sm" variant="destructive" onClick={onConfirm} disabled={pending}>
          {pending ? "Borrando…" : "Sí, borrar"}
        </Button>
      </div>
    </div>
  );
}
