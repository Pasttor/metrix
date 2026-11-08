import type { Metadata } from "next";
import { EmptyState } from "@/components/dashboard/empty-state";

export const metadata: Metadata = { title: "Configuración · Metrix" };

export default function SettingsPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground">Conexiones y estado de la sincronización</p>
      </header>
      <EmptyState message="La conexión de cuentas estará disponible pronto." />
    </>
  );
}
