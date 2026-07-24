import {
  Crosshair,
  Crown,
  Medal,
  Shield,
  Swords,
  type LucideIcon,
} from "lucide-react";

import type { MedalTier } from "@prisma/client";
import { cn } from "@/lib/utils";

import { TIER_LABEL } from "../lib/format";

const TIER_STYLES: Record<MedalTier, string> = {
  bronze: "border-amber-700/40 bg-amber-700/10 text-amber-500",
  silver: "border-zinc-400/40 bg-zinc-400/10 text-zinc-300",
  gold: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
  legendary: "border-violet-500/40 bg-violet-500/10 text-violet-300",
};

// Curated map so we don't bundle the entire lucide set by name.
const ICONS: Record<string, LucideIcon> = {
  crosshair: Crosshair,
  shield: Shield,
  swords: Swords,
  crown: Crown,
};

interface MedalBadgeProps {
  name: string;
  tier: MedalTier;
  icon?: string | null;
  className?: string;
}

export function MedalBadge({ name, tier, icon, className }: MedalBadgeProps) {
  const Icon = (icon && ICONS[icon]) || Medal;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        TIER_STYLES[tier],
        className,
      )}
      title={`${name} · ${TIER_LABEL[tier]}`}
    >
      <Icon className="size-3.5" />
      {name}
    </span>
  );
}
