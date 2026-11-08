import type { Metadata } from "next";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";

export const metadata: Metadata = { title: "TikTok · Metrix" };

export default function TikTokPage() {
  return (
    <>
      <PageHeader title="TikTok" />
      <EmptyState
        message="Aún no hay datos de TikTok. Conecta la cuenta para empezar a guardar historial."
        action={{ href: "/settings", label: "Ir a Configuración" }}
      />
    </>
  );
}
