import { cn } from "@/lib/utils";

import type { ProfileMedal } from "../lib/queries";
import { MedalEmblem, TIER_ACCENT } from "./medal-emblem";
import { MedalTierChip } from "./medal-tier-chip";

interface MemberMedalsProps {
  medals: ProfileMedal[];
  className?: string;
}

// awardedAt is a timestamptz serialized as ISO by the data layer; show just the day.
function formatAwardedDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/**
 * Medals earned by a member. Wide rows (2 columns at most) because the emblems
 * are circular and sit beside the text; the tinted, blurred surface keeps them
 * readable over the page's background image.
 */
export function MemberMedals({ medals, className }: MemberMedalsProps) {
  if (medals.length === 0) {
    return (
      <p className="bg-secondary/60 text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm backdrop-blur-sm">
        Nenhuma medalha conquistada ainda.
      </p>
    );
  }

  return (
    <div className={cn("grid gap-3 lg:grid-cols-2", className)}>
      {medals.map((medal) => {
        // Prefer the criteria (how it was earned); fall back to the description.
        const detail = medal.criteria ?? medal.description;
        return (
          <div
            key={medal.id}
            className="bg-secondary/80 hover:border-primary/40 relative flex items-center gap-4 overflow-hidden rounded-xl border p-4 shadow-sm backdrop-blur-md transition-colors"
          >
            {/* Tier glow anchored to the emblem. */}
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute -top-10 -left-10 size-32 rounded-full bg-gradient-to-br opacity-25 blur-2xl",
                TIER_ACCENT[medal.tier].surface,
              )}
            />

            <MedalEmblem
              name={medal.name}
              tier={medal.tier}
              imageUrl={medal.imageUrl}
              icon={medal.icon}
              size="md"
              className="relative"
            />

            <div className="relative min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-heading text-lg leading-none font-semibold">{medal.name}</p>
                <MedalTierChip tier={medal.tier} />
              </div>
              {detail ? (
                <p className="text-muted-foreground mt-1.5 text-sm leading-snug">{detail}</p>
              ) : null}
              <p className="text-muted-foreground/80 mt-2 text-[11px] tracking-wide uppercase">
                Conquistada em {formatAwardedDate(medal.awardedAt)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
