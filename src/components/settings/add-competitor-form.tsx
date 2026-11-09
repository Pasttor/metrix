"use client";

import { useActionState } from "react";
import { addCompetitorAction } from "@/app/(dashboard)/settings/competitors/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AddCompetitorForm() {
  const [state, action, pending] = useActionState(addCompetitorAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <Label htmlFor="competitor-username">Usuario de Instagram</Label>
      <div className="flex gap-2">
        <Input id="competitor-username" name="username" placeholder="@cuenta" autoComplete="off" required className="max-w-xs" />
        <Button type="submit" disabled={pending}>
          {pending ? "Verificando…" : "Agregar"}
        </Button>
      </div>
      <p aria-live="polite" className={`text-sm ${state?.ok === false ? "text-destructive" : "text-muted-foreground"}`}>
        {state?.message ?? "Debe ser una cuenta de empresa o de creador. Instagram solo comparte sus datos públicos: seguidores, publicaciones, me gusta y comentarios."}
      </p>
    </form>
  );
}
