import { ChevronRight, Crown } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

import { formatPoints, memberInitials } from "../lib/format";
import type { RankingEntry } from "../lib/queries";

// Only the podium gets colour; everyone else stays neutral so the list reads as
// a list and not as a wall of badges.
const RANK_ACCENT: Record<number, string> = {
  1: "border-yellow-400/50 bg-yellow-500/20 text-yellow-200",
  2: "border-zinc-300/40 bg-zinc-400/20 text-zinc-100",
  3: "border-orange-500/40 bg-orange-600/20 text-orange-200",
};

interface RankingRowProps {
  entry: RankingEntry;
  /** Highest score on the board, used for the relative progress bar. */
  topPoints: number;
  className?: string;
}

export function RankingRow({ entry, topPoints, className }: RankingRowProps) {
  const share = topPoints > 0 ? Math.max(2, (entry.points / topPoints) * 100) : 0;
  const isLeader = entry.rank === 1 && entry.points > 0;

  return (
    // Translucent surface: the page background image shows through without
    // costing contrast (see /ranking).
    <Link
      href={`/membros/${entry.memberId}`}
      className={cn(
        "group bg-card/80 hover:border-primary/60 hover:bg-card/95 focus-visible:ring-ring flex items-center gap-3 rounded-lg border px-3 py-2.5 shadow-lg shadow-black/20 backdrop-blur-md transition-colors focus-visible:ring-2 focus-visible:outline-none",
        isLeader && "border-yellow-500/40 bg-yellow-500/[0.08]",
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
        <AvatarImage
          src={entry.avatarUrl ?? "/member-default.png"}
          alt={entry.nickname}
        />
        <AvatarFallback className="font-heading text-xs">
          {memberInitials(entry.nickname)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="font-heading flex items-center gap-1.5 truncate text-base leading-none font-semibold">
          {entry.nickname}
          {isLeader ? (
            <Crown
              className="size-3.5 shrink-0 text-yellow-400"
              aria-label="Líder do mês"
            />
          ) : null}
        </p>
        {/* Score relative to the leader — gives the list a sense of distance. */}
        <div className="bg-background/70 mt-1.5 h-1 w-full max-w-40 overflow-hidden rounded-full">
          <div
            className={cn(
              "h-full rounded-full",
              isLeader ? "bg-yellow-400" : "bg-primary",
            )}
            style={{ width: `${share}%` }}
          />
        </div>
      </div>

      <div className="w-20 shrink-0 text-right">
        <span className="font-mono text-sm font-bold tabular-nums">
          {formatPoints(entry.points)}
        </span>
        <span className="text-muted-foreground ml-1 text-[10px] tracking-wide uppercase">
          pts
        </span>
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
