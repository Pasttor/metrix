"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the server components every `seconds` while some network is
 * still queued or processing, so statuses update without reloading. Pauses
 * while the tab is hidden and refreshes as soon as it is visible again.
 */
export function AutoRefresh({ active, seconds = 20 }: { active: boolean; seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, seconds * 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active, seconds, router]);

  return active ? (
    <p aria-live="polite" className="text-xs text-muted-foreground">
      Hay publicaciones en curso: esta lista se actualiza sola cada {seconds} s.
    </p>
  ) : null;
}
