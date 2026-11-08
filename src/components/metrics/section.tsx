import type { ReactNode } from "react";

export function Section({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col gap-3 rounded-xl border bg-card p-4 ${className}`}>
      <header className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}
