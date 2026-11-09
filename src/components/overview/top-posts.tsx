import Link from "next/link";
import type { OverviewPost } from "@/lib/metrics/unified-data";
import { formatDate, formatNumber, formatPercent, NO_DATA } from "@/lib/format";
import { NetworkIcon } from "./network-icon";

/** Ranked posts of every network with the network icon. */
export function TopPosts({ posts, empty }: { posts: OverviewPost[]; empty: string }) {
  if (posts.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="flex flex-col divide-y">
      {posts.map((post, i) => {
        const title = (
          <span className="flex min-w-0 items-center gap-2">
            <NetworkIcon platform={post.platform} className="size-4 shrink-0 text-muted-foreground" />
            <span className="sr-only">{post.network}:</span>
            <span className="truncate">{post.title}</span>
          </span>
        );
        return (
          <li key={post.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              {post.href ? (
                <Link href={post.href} className="hover:underline">
                  {title}
                </Link>
              ) : (
                title
              )}
              <span className="text-xs text-muted-foreground">
                {post.network} · {post.publishedAt ? formatDate(post.publishedAt) : NO_DATA}
              </span>
            </span>
            <span className="shrink-0 text-right tabular-nums">
              {formatNumber(post.views, { compact: true })} vistas
              <span className="block text-xs text-muted-foreground">{formatPercent(post.engagement)} eng.</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
