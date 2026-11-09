import type { ReactNode } from "react";
import Link from "next/link";

/** Layout for the public pages (no session needed). */
export function PublicPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10 md:py-16">
      <header className="flex flex-col gap-2">
        <Link href="/acerca" className="text-lg font-semibold tracking-tight">
          Metrix
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      </header>
      <div className="flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
      <footer className="mt-auto flex gap-4 border-t pt-4 text-xs text-muted-foreground">
        <Link href="/acerca" className="hover:text-foreground">
          Acerca de
        </Link>
        <Link href="/privacidad" className="hover:text-foreground">
          Privacidad
        </Link>
        <Link href="/login" className="hover:text-foreground">
          Entrar
        </Link>
      </footer>
    </main>
  );
}
