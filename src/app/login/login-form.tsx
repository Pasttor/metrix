"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendMagicLink, type LoginState } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "Acceso no autorizado.",
  link: "El enlace no es válido o ya caducó. Pide uno nuevo.",
};

const initialState: LoginState = { status: "idle" };

export function LoginForm() {
  const searchParams = useSearchParams();
  const [state, formAction, pending] = useActionState(sendMagicLink, initialState);

  const urlError = ERROR_MESSAGES[searchParams.get("error") ?? ""];
  const next = searchParams.get("next") ?? "";

  if (state.status === "sent") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Si el correo está autorizado, te llegará un enlace para entrar. Revisa tu bandeja de entrada.
      </p>
    );
  }

  const message = state.status === "error" ? state.message : urlError;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {message ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {message}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </div>
      <input type="hidden" name="next" value={next} />
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Enviar enlace de acceso"}
      </Button>
    </form>
  );
}
