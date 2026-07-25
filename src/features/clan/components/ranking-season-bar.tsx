import { Crown, Timer } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

import { formatPoints, memberInitials } from "../lib/format";
import type { RankingEntry } from "../lib/queries";
import { RankingCountdown } from "./ranking-countdown";

interface RankingSeasonBarProps {
  /** Current leader, or null when nobody scored this month. */
  leader: RankingEntry | null;
  /** ISO instant when the season closes. */
  endsAt: string;
  className?: string;
}

/**
 * One compact strip with the month's leader and the season countdown.
 *
 * Unlike the rows below it, this panel is fully opaque: it is the page's hero,
 * so it sits on a solid surface with a gold wash instead of letting the
 * background image bleed through and flatten its colours.
 */
export function RankingSeasonBar({
  leader,
  endsAt,
  className,
}: RankingSeasonBarProps) {
  return (
    <div
      className={cn(
        "bg-card relative overflow-hidden rounded-xl border shadow-xl shadow-black/40",
        leader && "border-yellow-500/35",
        className,
      )}
    >
      {leader ? (
        <>
          {/* Gold identity: a rail on the leader's edge, a warm wash across the
              left half and a soft glow behind the avatar. */}
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-yellow-300 via-yellow-500 to-amber-600"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-yellow-500/20 via-transparent to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -left-10 size-44 rounded-full bg-yellow-400/25 blur-3xl"
          />
        </>
      ) : (
        <div
          aria-hidden
          className="via-primary/70 absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent"
        />
      )}

      <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3 pr-4 pl-5">
        {leader ? (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-11 shrink-0 rounded-lg border-2 border-yellow-400/70 shadow-lg shadow-black/40">
              <AvatarImage
                src={leader.avatarUrl ?? "/member-default.png"}
                alt={leader.nickname}
                className="object-cover"
              />
              <AvatarFallback className="font-heading rounded-none text-xs">
                {memberInitials(leader.nickname)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-yellow-300 uppercase">
                <Crown className="size-3.5 shrink-0" aria-hidden />
                Líder do mês
              </p>
              <p className="font-heading truncate text-xl leading-tight font-bold">
                {leader.nickname}
              </p>
            </div>

            {/* The score as a chip rather than trailing text: it is the reason
                this member is here, so it gets its own weight. */}
            <span className="ml-1 shrink-0 rounded-md border border-yellow-400/40 bg-yellow-400/15 px-2.5 py-1.5 font-mono text-sm leading-none font-bold text-yellow-200 tabular-nums">
              {formatPoints(leader.points)}
              <span className="ml-1 text-[10px] tracking-wide uppercase opacity-80">
                pts
              </span>
            </span>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Ninguém pontuou neste mês ainda.
          </p>
        )}

        <div className="flex items-center gap-2.5">
          <Timer className="text-primary size-4 shrink-0" aria-hidden />
          <div className="flex flex-col items-end gap-1">
            <p className="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">
              Encerra em
            </p>
            <RankingCountdown endsAt={endsAt} />
          </div>
        </div>
      </div>
    </div>
  );
}
