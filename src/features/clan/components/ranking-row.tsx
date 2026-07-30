import { ArrowDown, ArrowUp, ChevronRight, Crown } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

import { formatPoints, memberInitials } from "../lib/format";
import type { RankingEntry } from "../lib/queries";

// Only the podium gets colour; everyone else stays neutral so the list reads as
// a list and not as a wall of badges.
//
// Rank 1 is a SOLID gold chip rather than the 20%-alpha tint the other two use.
// With the leader's row deliberately carrying no background tint, the number is
// one of the few places the gold can actually land, so it has to read as paint
// and not as a haze.
const RANK_ACCENT: Record<number, string> = {
  1: "border-yellow-300 bg-yellow-400 text-yellow-950",
  2: "border-zinc-300/40 bg-zinc-400/20 text-zinc-100",
  3: "border-orange-500/40 bg-orange-600/20 text-orange-200",
};

interface RankingRowProps {
  entry: RankingEntry;
  /** Highest score on the board, used for the relative progress bar. */
  topPoints: number;
  /**
   * Whether this row is the signed-in member's own.
   *
   * Passed down rather than resolved here because the session is a server read and this
   * is a Client Component — and because a row should not know how identity works.
   */
  isViewer?: boolean;
  className?: string;
}

export function RankingRow({ entry, topPoints, isViewer = false, className }: RankingRowProps) {
  const share = topPoints > 0 ? Math.max(2, (entry.points / topPoints) * 100) : 0;
  const isLeader = entry.rank === 1 && entry.points > 0;

  return (
    // Translucent surface: the page background image shows through without
    // costing contrast (see /ranking).
    <Link
      href={`/membros/${entry.memberId}`}
      className={cn(
        "group bg-card/80 hover:border-primary/60 hover:bg-card/95 focus-visible:ring-ring flex items-center gap-3 rounded-lg border px-3 py-2.5 shadow-lg shadow-black/20 backdrop-blur-md transition-colors focus-visible:ring-2 focus-visible:outline-none",
        // THE VIEWER'S OWN ROW, as an OUTLINE — the third border-ish property, and the
        // only one still free.
        //
        // `border` is the leader's gold left edge and the hover state; `ring` is the
        // leader's inset gold glow AND the focus indicator. Using either would have made
        // one of those unsayable, and tailwind-merge settles the collision by dropping
        // whichever comes first in the class list, so it would have failed silently
        // depending on the order. `outline` collides with nothing and follows the
        // `rounded-lg` radius, which is what makes it read as a circle around the card.
        //
        // 2px at 50%: light, as asked, but the point of the mark is being findable while
        // scanning 99 rows, so 1px lost that argument. Focus still wins on top of it —
        // `focus-visible:outline-none` drops this one and the 2px ring takes over.
        isViewer && "outline-primary/50 outline-2",
        // The leader's surface is the PLAIN card colour at full opacity, and the
        // gold lives entirely in the border and the accents. No tint, no wash.
        //
        // Two earlier attempts both read as "transparent" and are worth not
        // repeating. First `bg-yellow-500/[0.08]`, which REPLACED the `bg-card/80`
        // above it, leaving the top row with less surface than the rows below —
        // a faint tint over raw backdrop-blur. Then an opaque `bg-card` under a
        // `from-yellow-400/20 ... to-transparent` gradient: nothing showed
        // through any more, but an alpha wash still looks washed out, because a
        // fading overlay is what transparency looks like even when it is opaque.
        //
        // `--card` is `oklch(0.284 0.012 235)`, no alpha, so `bg-card` alone is
        // solid. `hover:bg-card` is repeated because the base `hover:bg-card/95`
        // would otherwise reintroduce translucency on hover, and
        // `backdrop-blur-none` because blurring behind an opaque fill only costs
        // compositing work.
        // The gold glow lives INSIDE the row, as an inset shadow blooming from the
        // edges inward, plus a 1px inset ring on the border.
        //
        // Why an inset shadow and not the background wash that was rejected: a
        // gradient background is a flat film across the whole surface, which is
        // what made the card read as see-through. An inset shadow is anchored to
        // the edges and fades to nothing in the middle, so the centre of the row
        // stays the plain, solid card colour.
        //
        // `inset-shadow-*` is its own Tailwind group (`--tw-inset-shadow`), so it
        // composes with the base `shadow-lg shadow-black/20` instead of fighting
        // it — the row keeps its depth against the page and gains the gold within.
        isLeader && [
          "bg-card hover:bg-card backdrop-blur-none",
          "border-l-4 border-yellow-400 hover:border-yellow-300",
          "inset-shadow-[0_0_28px_-4px_rgb(250_204_21_/_0.45)]",
          "hover:inset-shadow-[0_0_32px_-2px_rgb(250_204_21_/_0.6)]",
          "ring-1 ring-yellow-400/30 ring-inset",
        ],
        className,
      )}
    >
      <span
        className={cn(
          "font-heading flex size-7 shrink-0 items-center justify-center rounded-md border text-sm font-bold tabular-nums",
          RANK_ACCENT[entry.rank] ?? "text-muted-foreground border-transparent",
        )}
      >
        {entry.rank}
      </span>

      <Avatar className="size-9 shrink-0">
        <AvatarImage src={entry.avatarUrl ?? "/member-default.png"} alt={entry.nickname} />
        <AvatarFallback className="font-heading text-xs">
          {memberInitials(entry.nickname)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        {/* Name, then the crown, then the movement, all on one line.
            The nickname carries `truncate` on its own span rather than on the row:
            with the movement inside a flex line, truncating the whole line would
            let a long name push the arrow out of view — and the arrow is the part
            that changes between visits. */}
        <p className="font-heading flex items-center gap-1.5 text-base leading-none font-semibold">
          <span className="truncate">{entry.nickname}</span>
          {/* The ring is invisible to a screen reader, so the same fact is stated in
              text. Hidden visually because the ring already says it on screen, and two
              markers would be noise. */}
          {isViewer ? <span className="sr-only">(você)</span> : null}
          {isLeader ? (
            <Crown className="size-3.5 shrink-0 text-yellow-400" aria-label="Líder do mês" />
          ) : null}
          <RankMovement rank={entry.rank} previousRank={entry.previousRank} />
        </p>
        {/* Score relative to the leader — gives the list a sense of distance. */}
        <div className="bg-background/70 mt-1.5 h-1 w-full max-w-40 overflow-hidden rounded-full">
          <div
            className={cn("h-full rounded-full", isLeader ? "bg-yellow-400" : "bg-primary")}
            style={{ width: `${share}%` }}
          />
        </div>
      </div>

      <div className="w-20 shrink-0 text-right">
        <span className="font-mono text-sm font-bold tabular-nums">
          {formatPoints(entry.points)}
        </span>
        <span className="text-muted-foreground ml-1 text-[10px] tracking-wide uppercase">pts</span>
      </div>

      {/* The whole row is the link, so this is the affordance for it, not a
          second control — the standard "opens a detail view" chevron. Decorative
          on purpose: the link already announces the member and the score, and a
          real <button> here would be invalid inside an anchor. */}
      <span
        aria-hidden
        className="border-border text-muted-foreground group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors"
      >
        <ChevronRight className="size-4" />
      </span>
    </Link>
  );
}

/**
 * Positions gained or lost in the last three hours (MOVEMENT_WINDOW_MS in
 * queries.ts, where the measurement behind that number lives), inline after the
 * member's name.
 *
 * Renders nothing at all in three cases, and each is deliberate: no comparable
 * standing (`previousRank` null — see RankingEntry), no change, and a closed
 * season, where the board is final and an arrow would suggest it still moves.
 *
 * The number rides beside the arrow rather than replacing it: colour alone would
 * carry the direction, and red/green is the one pair colourblind readers cannot
 * separate.
 */
function RankMovement({ rank, previousRank }: { rank: number; previousRank: number | null }) {
  if (previousRank === null || previousRank === rank) return null;

  const delta = previousRank - rank;
  const up = delta > 0;
  const Icon = up ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        // `shrink-0` so the flex line squeezes the NAME and never this: a member
        // with a long nickname would otherwise lose the one part of the row that
        // says something changed.
        "flex shrink-0 items-center gap-px font-mono text-[11px] leading-none font-semibold tabular-nums",
        up ? "text-emerald-400" : "text-red-400",
      )}
      title={`${up ? "Subiu" : "Caiu"} ${Math.abs(delta)} ${Math.abs(delta) > 1 ? "posições" : "posição"} nas últimas 3 h`}
    >
      <Icon className="size-3" aria-hidden />
      <span className="sr-only">{up ? "subiu" : "caiu"}</span>
      {Math.abs(delta)}
    </span>
  );
}
