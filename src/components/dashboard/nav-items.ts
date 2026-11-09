import { Bell, CalendarClock, Camera, CirclePlay, FileText, LayoutDashboard, Music2, Settings, ThumbsUp, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Resumen", icon: LayoutDashboard },
  { href: "/youtube", label: "YouTube", icon: CirclePlay },
  { href: "/instagram", label: "Instagram", icon: Camera },
  { href: "/facebook", label: "Facebook", icon: ThumbsUp },
  { href: "/tiktok", label: "TikTok", icon: Music2 },
  { href: "/reportes", label: "Reportes", icon: FileText },
  { href: "/publicar", label: "Publicar", icon: CalendarClock },
  { href: "/alertas", label: "Alertas", icon: Bell },
  { href: "/settings", label: "Configuración", icon: Settings },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
