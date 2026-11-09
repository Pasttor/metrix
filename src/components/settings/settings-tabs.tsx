import Link from "next/link";

const TABS = [
  { href: "/settings/connections", label: "Conexiones" },
  { href: "/settings/competitors", label: "Competencia" },
];

export function SettingsTabs({ active }: { active: string }) {
  return (
    <nav aria-label="Configuración" className="flex w-fit gap-1 rounded-lg border p-0.5 text-sm">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.href === active ? "page" : undefined}
          className="rounded-md px-3 py-1 text-muted-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
