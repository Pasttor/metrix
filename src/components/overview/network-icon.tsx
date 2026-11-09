import { Camera, CirclePlay, Music2, ThumbsUp, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = { youtube: CirclePlay, instagram: Camera, facebook: ThumbsUp, tiktok: Music2 };

export function NetworkIcon({ platform, className = "size-4" }: { platform: string; className?: string }) {
  const Icon = ICONS[platform] ?? CirclePlay;
  return <Icon aria-hidden className={className} />;
}
