"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  applyTheme,
  readThemePreference,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "./theme";

const NEXT: Record<ThemePreference, ThemePreference> = { light: "dark", dark: "system", system: "light" };

const LABELS: Record<ThemePreference, string> = {
  light: "Tema claro",
  dark: "Tema oscuro",
  system: "Tema del sistema",
};

function subscribe(callback: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function ThemeToggle() {
  // Server snapshot is "system"; the stored value takes over right after hydration.
  const preference = useSyncExternalStore(subscribe, readThemePreference, () => "system" as const);

  // Follow OS changes while on "system".
  useEffect(() => {
    applyTheme(preference);
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  function cycle() {
    const next = NEXT[preference];
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the theme still applies for this page view.
    }
    applyTheme(next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  const Icon = preference === "light" ? Sun : preference === "dark" ? Moon : Monitor;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={cycle}
      aria-label={`${LABELS[preference]}. Cambiar a ${LABELS[NEXT[preference]].toLowerCase()}`}
      title={LABELS[preference]}
    >
      <Icon className="size-4" aria-hidden />
    </Button>
  );
}
