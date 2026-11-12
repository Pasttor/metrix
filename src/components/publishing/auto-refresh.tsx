"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { advancePublishingAction } from "@/app/(dashboard)/publicar/actions";

/**
 * While some network is queued or processing, advances the publish queue on
 * the server (upload what is due, ask each network for its status) and
 * re-renders the list, every `seconds` after the previous round finishes. So a
 * post shows Publicado or Falló right after the network finishes instead of
 * waiting for the next cron run. Pauses while the tab is hidden; the cron keeps
 * the queue moving when nobody is watching.
 */
export function AutoRefresh({ active, seconds = 5 }: { active: boolean; seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let running = false;
    let timer: number | undefined;

    const round = async () => {
      if (stopped || running || document.visibilityState !== "visible") return;
      running = true;
      try {
        await advancePublishingAction();
      } catch {
        // A failed round only delays the next status; the cron still runs.
      } finally {
        running = false;
      }
      if (stopped) return;
      router.refresh();
      timer = window.setTimeout(round, seconds * 1000);
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(timer);
      void round();
    };

    void round();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, seconds, router]);

  return active ? (
    <p aria-live="polite" className="text-xs text-muted-foreground">
      Hay publicaciones en curso: Metrix revisa cada red en tiempo real mientras esta página esté abierta.
    </p>
  ) : null;
}
