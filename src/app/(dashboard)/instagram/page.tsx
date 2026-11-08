import type { Metadata } from "next";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";

export const metadata: Metadata = { title: "Instagram · Metrix" };

export default function InstagramPage() {
  return (
    <>
      <PageHeader title="Instagram" />
      <EmptyState
        message="Aún no hay datos de Instagram. Conecta la cuenta para empezar a guardar historial."
        action={{ href: "/settings", label: "Ir a Configuración" }}
      />
    </>
  );
}
