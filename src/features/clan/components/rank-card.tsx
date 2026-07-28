"use client";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { rankProgress } from "@/lib/ranks";
import { cn } from "@/lib/utils";

import { formatPoints } from "../lib/format";
import { RankInsignia } from "./rank-insignia";

/**
 * Above this length the name needs two lines at 18px, which crowds the card, so
 * it drops to 14px. "Subtenente" (10) still fits big; "Segundo-Tenente" (15)
 * does not.
 */
const LONG_NAME_LENGTH = 11;

interface RankCardProps {
  /** Cumulative career points. */
  points: number;
  className?: string;
}

/**
 * Profile header card, sized to match the "Melhor classe" card beside it
 * (118x153). Progress bar on top, insignia in the middle, rank name at the
 * bottom. The numbers live in the hover card, not on the face.
 */
export function RankCard({ points, className }: RankCardProps) {
  const { rank, next, pointsIntoRank, rankSpan, pointsToNext, fraction } = rankProgress(points);

  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <div
          className={cn(
            // p-4 matches the class card's padding, so both names sit the same
            // distance from the bottom edge and line up.
            "bg-secondary/70 flex h-[153px] w-[118px] cursor-default flex-col items-center justify-between gap-2 rounded-lg p-4 backdrop-blur",
            className,
          )}
        >
          <div
            className="bg-background/60 h-1.5 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={rankSpan || 1}
            aria-valuenow={rankSpan ? pointsIntoRank : 1}
            aria-label={next ? `Progresso para ${next.name}` : "Patente máxima do clã alcançada"}
          >
            <div
              className="bg-primary h-full rounded-full transition-[width] duration-500"
              style={{ width: `${fraction * 100}%` }}
            />
          </div>

          <RankInsignia rank={rank} size="lg" silent />

          {/* Same type treatment as the class name beside it, one step smaller
              when the name is long enough to wrap. */}
          {/* Fixed-height box, same as the class card's name, so both labels
              line up optically despite the different font sizes. Two lines fit,
              for the rare name that still wraps at 14px.
              The /[1] modifier pins line-height to 1: on its own, `leading-none`
              loses to the line-height that text-sm/text-lg carry in Tailwind v4. */}
          <p
            className={cn(
              "font-heading flex h-7 items-center text-center font-semibold",
              rank.name.length > LONG_NAME_LENGTH ? "text-sm/[1]" : "text-lg/[1]",
            )}
          >
            {rank.name}
          </p>
        </div>
      </HoverCardTrigger>

      <HoverCardContent className="w-auto max-w-64 py-2 text-sm">
        <p className="font-heading font-semibold">{rank.name}</p>
        <p className="mt-1 font-mono text-xs tabular-nums">
          {formatPoints(points)}
          {next ? `/${formatPoints(next.threshold)}` : ""} pts
        </p>
        <p className="text-muted-foreground mt-0.5">
          {next ? (
            <>
              Faltam <span className="font-mono tabular-nums">{formatPoints(pointsToNext)}</span>{" "}
              pts para {next.name}
            </>
          ) : (
            "Patente máxima do clã"
          )}
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}
