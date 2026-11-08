"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRange } from "@/hooks/use-range";
import { DEFAULT_RANGE, withRange, type Range } from "@/lib/range";
import { cn } from "@/lib/utils";
import { isActive, NAV_ITEMS } from "./nav-items";

function NavLinks({ pathname, range }: { pathname: string | null; range: Range }) {
  return (
    <ul className="flex gap-1 md:flex-col">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname !== null && isActive(pathname, href);
        return (
          <li key={href}>
            <Link
              href={withRange(href, range)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active && "bg-muted text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Links carry the current `?range=` so the period survives navigation. */
export function SidebarNav() {
  return <NavLinks pathname={usePathname()} range={useRange()} />;
}

/** Static fallback while the URL is read (prerendered shell). */
export function SidebarNavFallback() {
  return <NavLinks pathname={null} range={DEFAULT_RANGE} />;
}
