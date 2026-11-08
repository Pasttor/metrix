import type { Metadata } from "next";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";

export const metadata: Metadata = { title: "Facebook · Metrix" };

export default function FacebookPage() {
  return (
    <>
      <PageHeader title="Facebook" />
      <EmptyState
        message="Aún no hay datos de Facebook. Conecta la cuenta para empezar a guardar historial."
        action={{ href: "/settings", label: "Ir a Configuración" }}
      />
    </>
  );
}
