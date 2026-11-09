import type { ComparisonRow } from "@/lib/metrics/competitors-data";
import { formatNumber, formatPercent, NO_DATA } from "@/lib/format";

function signed(value: number | null): string {
  if (value === null) return NO_DATA;
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatNumber(Math.abs(value))}`;
}

/** Your Instagram account next to the tracked competitors (public numbers only). */
export function CompetitorTable({ rows, actions }: { rows: ComparisonRow[]; actions?: (row: ComparisonRow) => React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b bg-muted/40 text-left text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Cuenta</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Seguidores</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Cambio 7 días</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Publicaciones 30 días</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Me gusta promedio</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Comentarios promedio</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Engagement</th>
            {actions ? <th scope="col" className="px-3 py-2"><span className="sr-only">Acciones</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id ?? "own"} className={`border-b last:border-b-0 ${row.isOwn ? "bg-muted/30 font-medium" : ""}`}>
              <td className="px-3 py-2">
                <span className="flex items-center gap-2">
                  {row.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote Instagram profile picture
                    <img src={row.avatarUrl} alt="" className="size-7 rounded-full object-cover" loading="lazy" />
                  ) : (
                    <span className="size-7 rounded-full bg-muted" />
                  )}
                  <span className="flex flex-col">
                    <span>@{row.username}</span>
                    {row.name ? <span className="text-xs font-normal text-muted-foreground">{row.name}</span> : null}
                  </span>
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.followers)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{signed(row.followersChange7d)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.postsLast30d)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.avgLikes === null ? null : Math.round(row.avgLikes))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.avgComments === null ? null : Math.round(row.avgComments))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatPercent(row.engagement, 2)}</td>
              {actions ? <td className="px-3 py-2 text-right">{actions(row)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
