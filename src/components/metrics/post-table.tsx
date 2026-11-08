"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import { useRange } from "@/hooks/use-range";
import type { PostColumn, PostFilter, PostTableRow } from "@/lib/metrics/posts";
import { formatDate, formatValue, NO_DATA } from "@/lib/format";
import { withRange } from "@/lib/range";

const PUBLISHED = "publishedAt";

function sortValue(row: PostTableRow, key: string): number | string | null {
  return key === PUBLISHED ? row.publishedAt : (row.values[key] ?? null);
}

/**
 * Sortable post table with type filters, shared by every network. Missing
 * values show as "—" and always sort last.
 */
export function PostTable({
  rows,
  columns,
  filters,
  itemLabel = "publicaciones",
  note,
}: {
  rows: PostTableRow[];
  columns: PostColumn[];
  filters: PostFilter[];
  itemLabel?: string;
  note?: string;
}) {
  const range = useRange();
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: PUBLISHED, desc: true });

  const allFilters = [{ key: "all", label: "Todos" }, ...filters.filter((option) => rows.some((row) => row.type === option.key))];
  const counts = (key: string) => (key === "all" ? rows.length : rows.filter((row) => row.type === key).length);

  const visible = useMemo(() => {
    const filtered = filter === "all" ? rows : rows.filter((row) => row.type === filter);
    return [...filtered].sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      const result = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
      return sort.desc ? -result : result;
    });
  }, [rows, filter, sort]);

  const headers = [...columns.map((column) => ({ key: column.key, label: column.label })), { key: PUBLISHED, label: "Publicado" }];

  return (
    <div className="flex flex-col gap-3">
      {allFilters.length > 2 ? (
        <div role="group" aria-label="Tipo de publicación" className="flex w-fit flex-wrap gap-1 rounded-lg border p-0.5">
          {allFilters.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={filter === option.key}
              onClick={() => setFilter(option.key)}
              className="rounded-md px-2.5 py-1 text-sm text-muted-foreground aria-pressed:bg-muted aria-pressed:font-medium aria-pressed:text-foreground"
            >
              {option.label} <span className="tabular-nums">({counts(option.key)})</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Publicación
              </th>
              {headers.map((header) => {
                const active = sort.key === header.key;
                return (
                  <th key={header.key} scope="col" aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"} className="px-3 py-2 text-right font-medium">
                    <button
                      type="button"
                      onClick={() => setSort({ key: header.key, desc: active ? !sort.desc : true })}
                      className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}
                    >
                      {header.label}
                      {active ? sort.desc ? <ArrowDown aria-hidden className="size-3" /> : <ArrowUp aria-hidden className="size-3" /> : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const content = (
                <>
                  {row.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote thumbnails from the networks' CDNs
                    <img src={row.thumbnailUrl} alt="" className="h-10 w-16 shrink-0 rounded object-cover" loading="lazy" />
                  ) : (
                    <span className="h-10 w-16 shrink-0 rounded bg-muted" />
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-1 truncate font-medium hover:underline">
                      <span className="truncate">{row.title}</span>
                      {row.external ? <ExternalLink aria-hidden className="size-3 shrink-0" /> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">{row.subtitle}</span>
                  </span>
                </>
              );
              return (
                <tr key={row.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="max-w-80 px-3 py-2">
                    {row.href === null ? (
                      <span className="flex items-center gap-3">{content}</span>
                    ) : row.external ? (
                      <a href={row.href} target="_blank" rel="noreferrer" className="flex items-center gap-3">
                        {content}
                      </a>
                    ) : (
                      <Link href={withRange(row.href, range)} className="flex items-center gap-3">
                        {content}
                      </Link>
                    )}
                  </td>
                  {columns.map((column) => (
                    <td key={column.key} className="px-3 py-2 text-right tabular-nums">
                      {formatValue(row.values[column.key] ?? null, column.format)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">{row.publishedAt ? formatDate(row.publishedAt) : NO_DATA}</td>
                </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={headers.length + 1} className="px-3 py-6 text-center text-muted-foreground">
                  No hay {itemLabel} todavía.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}
