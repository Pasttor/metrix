import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readAuthorizeRequest, redirectWith, validateAuthorizeRequest } from "@/lib/mcp-oauth/core";
import { appUrl } from "@/lib/mcp-oauth/http";
import { supabaseOAuthStore } from "@/lib/mcp-oauth/supabase-store";
import { decideAuthorization } from "./actions";

export const metadata: Metadata = { title: "Conectar con Claude · Metrix" };

const FIELDS = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"] as const;

function Problem({ message }: { message: string }) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>No se pudo conectar</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

async function Consent({ searchParams }: { searchParams: PageProps<"/oauth/authorize">["searchParams"] }) {
  const params = await searchParams;
  if (params.error) return <Problem message="La solicitud de conexión no es válida. Vuelve a intentarlo desde Claude." />;

  const request = readAuthorizeRequest(params);
  const checked = await validateAuthorizeRequest(supabaseOAuthStore(), request, `${appUrl()}/api/mcp`);
  if (!checked.ok) {
    if (checked.redirect) redirect(redirectWith(request.redirectUri, { error: checked.error, error_description: checked.description, state: request.state, iss: appUrl() }));
    return <Problem message={checked.description} />;
  }

  // CIMD names are self-asserted: show the host that will receive the access.
  const destination = new URL(request.redirectUri);
  const who = destination.hostname === "localhost" || destination.hostname === "127.0.0.1" ? "una app en esta computadora (Claude Code)" : destination.hostname;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Conectar Claude con Metrix</CardTitle>
        <CardDescription>
          <strong className="text-foreground">{checked.client.name ?? "Una app"}</strong> ({who}) quiere acceder a tu Metrix.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Leer todas tus métricas, publicaciones, retención, audiencia, reportes y alertas.</li>
          <li>Ver, programar, cancelar y reintentar publicaciones con videos de tu Google Drive.</li>
        </ul>
        <p className="text-xs text-muted-foreground">Puedes quitar el acceso cuando quieras en Configuración → Claude.</p>
        <form action={decideAuthorization} className="flex gap-2">
          {FIELDS.map((field) => {
            const value = params[field];
            return typeof value === "string" ? <input key={field} type="hidden" name={field} value={value} /> : null;
          })}
          <Button type="submit" name="decision" value="allow">
            Permitir
          </Button>
          <Button type="submit" name="decision" value="deny" variant="outline">
            Cancelar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function AuthorizePage(props: PageProps<"/oauth/authorize">) {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      {/* Reads the request and the session, so it renders at request time. */}
      <Suspense fallback={<div className="h-64 w-full max-w-md animate-pulse rounded-xl bg-muted" />}>
        <Consent searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
