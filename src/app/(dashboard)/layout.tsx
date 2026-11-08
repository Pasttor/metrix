import { Suspense } from "react";
import Link from "next/link";
import { RangeSelector, RangeSelectorFallback } from "@/components/dashboard/range-selector";
import { SidebarNav, SidebarNavFallback } from "@/components/dashboard/sidebar-nav";
import { UserMenu } from "@/components/dashboard/user-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="border-b md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex h-14 items-center px-4 md:px-5">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Metrix
          </Link>
        </div>
        <nav aria-label="Principal" className="overflow-x-auto px-2 pb-2 md:px-3">
          {/* Reads the URL (current page and range), so it renders at request time. */}
          <Suspense fallback={<SidebarNavFallback />}>
            <SidebarNav />
          </Suspense>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b px-4 md:px-6">
          <Suspense fallback={<RangeSelectorFallback />}>
            <RangeSelector />
          </Suspense>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Suspense fallback={null}>
              <UserMenu />
            </Suspense>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
