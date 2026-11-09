import { Suspense } from "react";
import type { Metadata } from "next";
import { Section } from "@/components/metrics/section";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/db/server";
import { getEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { fail } from "@/lib/metrics/data";
import { revokeGrantAction } from "./actions";

export const metadata: Metadata = { title: "Claude · Metrix" };

async function Grants() {
  const db = await createClient();
  const { data, error } = await db
    .from("mcp_grants")
    .select("id, client_name, created_at, last_used_at, revoked_at")
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) fail("mcp_grants.list", error);
  if (data.length === 0) return <p className="text-sm text-muted-foreground">Claude todavía no está conectado.</p>;
  return (
    <ul className="flex flex-col divide-y rounded-xl border">
      {data.map((grant) => (
        <li key={grant.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{grant.client_name ?? "Cliente MCP"}</span>
            <span className="text-xs text-muted-foreground">
              Conectado {formatDateTime(grant.created_at)} · {grant.last_used_at ? `último uso ${formatDateTime(grant.last_used_at)}` : "sin usar todavía"}
            </span>
          </div>
          <form action={revokeGrantAction}>
            <input type="hidden" name="id" value={grant.id} />
            <Button type="submit" size="sm" variant="outline">
              Quitar acceso
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}

export default function ClaudeSettingsPage() {
  const url = `${getEnv().APP_URL.replace(/\/$/, "")}/api/mcp`;
  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Claude</h1>
          <p className="text-sm text-muted-foreground">Conecta Claude para que lea tus datos, haga reportes y programe publicaciones.</p>
        </div>
        <SettingsTabs active="/settings/claude" />
      </header>
      <Section title="Cómo conectarlo">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            En Claude: <strong className="text-foreground">Configuración → Conectores → Agregar conector personalizado</strong>.
          </li>
          <li>
            Nombre: <code>Metrix</code>. URL: <code className="text-foreground">{url}</code>
          </li>
          <li>Da clic en Conectar, entra a Metrix si te lo pide y acepta en la pantalla «Conectar Claude con Metrix».</li>
          <li>
            En Claude Code: <code>claude mcp add --transport http metrix {url}</code>
          </li>
        </ol>
      </Section>
      <Section title="Accesos activos" description="Quitar el acceso desconecta a ese cliente al instante.">
        {/* Reads the session, so it renders at request time. */}
        <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-muted" />}>
          <Grants />
        </Suspense>
      </Section>
    </>
  );
}
