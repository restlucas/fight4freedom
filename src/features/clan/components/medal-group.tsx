import { cn } from "@/lib/utils";

import type { MemberMedalPreview } from "../lib/queries";
import { MedalEmblem } from "./medal-emblem";

interface MedalGroupProps {
  /** Most recently awarded first, already capped by the query. */
  medals: MemberMedalPreview[];
  /** Total earned; anything past `medals` collapses into a "+N" chip. */
  total: number;
  className?: string;
}

/**
 * Overlapping stack of a member's latest medals, in the style of an avatar
 * group. Replaces the plain medal counter in the listing.
 */
export function MedalGroup({ medals, total, className }: MedalGroupProps) {
  if (medals.length === 0) return null;

  const overflow = total - medals.length;

  return (
    <div
      className={cn("flex shrink-0 items-center", className)}
      role="group"
      aria-label={`${total} ${total === 1 ? "medalha" : "medalhas"}`}
    >
      {medals.map((medal) => (
        <MedalEmblem
          key={medal.id}
          name={medal.name}
          tier={medal.tier}
          imageUrl={medal.imageUrl}
          icon={medal.icon}
          size="xs"
          // Pulled together like an avatar group; the ring separates each one
          // from the medal underneath it.
          className="ring-card -ml-1.5 ring-2 transition-transform first:ml-0 hover:-translate-y-0.5"
        />
      ))}
      {overflow > 0 ? (
        <span
          className="bg-secondary ring-card text-muted-foreground -ml-1.5 flex size-8 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums ring-2"
          title={`Mais ${overflow} ${overflow === 1 ? "medalha" : "medalhas"}`}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
