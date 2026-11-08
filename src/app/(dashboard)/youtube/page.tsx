import type { Metadata } from "next";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";

export const metadata: Metadata = { title: "YouTube · Metrix" };

export default function YouTubePage() {
  return (
    <>
      <PageHeader title="YouTube" />
      <EmptyState
        message="Aún no hay datos de YouTube. Conecta la cuenta para empezar a guardar historial."
        action={{ href: "/settings", label: "Ir a Configuración" }}
      />
    </>
  );
}
