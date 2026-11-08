"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useRange } from "@/hooks/use-range";
import { DEFAULT_RANGE, RANGE_OPTIONS, RANGE_PARAM, type Range } from "@/lib/range";
import { cn } from "@/lib/utils";

function hrefFor(pathname: string, params: URLSearchParams, range: Range): string {
  const next = new URLSearchParams(params);
  if (range === DEFAULT_RANGE) next.delete(RANGE_PARAM);
  else next.set(RANGE_PARAM, String(range));
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function optionClass(active: boolean) {
  return cn(
    "rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
  );
}

/** Without `hrefOf` (prerendered fallback) the options render as plain labels. */
function Options({ current, hrefOf }: { current: Range; hrefOf?: (range: Range) => string }) {
  return (
    <nav aria-label="Periodo" className="inline-flex rounded-lg border bg-background p-0.5">
      {RANGE_OPTIONS.map((range) => {
        const active = range === current;
        return hrefOf ? (
          <Link
            key={range}
            href={hrefOf(range)}
            replace
            scroll={false}
            aria-current={active ? "true" : undefined}
            aria-label={`Últimos ${range} días`}
            className={optionClass(active)}
          >
            {range} d
          </Link>
        ) : (
          <span key={range} className={optionClass(active)}>
            {range} d
          </span>
        );
      })}
    </nav>
  );
}

export function RangeSelector() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = useRange();
  return <Options current={current} hrefOf={(range) => hrefFor(pathname, searchParams, range)} />;
}

export function RangeSelectorFallback() {
  return <Options current={DEFAULT_RANGE} />;
}
