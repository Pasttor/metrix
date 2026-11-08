"use client";

import { Suspense } from "react";
import { useRange } from "@/hooks/use-range";

function RangeLabel() {
  return <>Últimos {useRange()} días</>;
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">
        <Suspense fallback="Últimos 28 días">
          <RangeLabel />
        </Suspense>
        {description ? ` · ${description}` : null}
      </p>
    </header>
  );
}
