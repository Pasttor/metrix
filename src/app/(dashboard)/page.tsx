import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";

export default function OverviewPage() {
  return (
    <>
      <PageHeader title="Resumen" description="Todas tus redes" />
      <EmptyState
        message="Todavía no hay cuentas conectadas."
        action={{ href: "/settings", label: "Ir a Configuración" }}
      />
    </>
  );
}
