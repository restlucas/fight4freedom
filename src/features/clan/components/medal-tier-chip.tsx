import type { MedalTier } from "@prisma/client";
import { cn } from "@/lib/utils";

import { TIER_LABEL } from "../lib/format";
import { TIER_ACCENT } from "./medal-emblem";

interface MedalTierChipProps {
  tier: MedalTier;
  className?: string;
}

/** Small rarity label that shares the emblem's tier accent. */
export function MedalTierChip({ tier, className }: MedalTierChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-widest uppercase",
        TIER_ACCENT[tier].chip,
        className,
      )}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}
