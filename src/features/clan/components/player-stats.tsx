import {
  Award,
  Clock,
  Crosshair,
  Crown,
  Dog,
  Flag,
  Gamepad2,
  Handshake,
  HeartPulse,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Target,
  TrendingDown,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { PlayerClass } from "@prisma/client";
import { cn } from "@/lib/utils";
import { killsPerMatch, totalMatches, type StatTotals } from "@/lib/stats/snapshots";

import { formatCompactNumber } from "@/lib/format";

import {
  CLASS_LABEL,
  formatHeadshotRate,
  formatHours,
  formatKillsPerMatch,
  formatNumber,
} from "../lib/format";
import { STAT_KEY_LABEL, type StatKey } from "../lib/stat-keys";

/**
 * The account's collectables and XP, from the game rather than from our ranking.
 *
 * One object instead of five loose props because they arrive together, from the
 * same rotating pass, and are all null for the same reason: the member has not been
 * through it yet (Fase 9.2).
 */
export type GameProgressTiles = {
  /**
   * Badge and dog-tag COUNTS. The source has no catalogue of which ones, so there
   * is no wall of art to build here — see docs/api-gametools.md §13.4.
   */
  badgeCount: number | null;
  dogTagCount: number | null;
  /** Redsec ranked division, already filtered: unranked arrives as null. */
  competitiveRankName: string | null;
  competitiveRankMode: string | null;
  /** Lifetime XP. Zero means the snapshot predates the column, not zero XP. */
  xpTotal: number;
};

interface PlayerStatsProps {
  stats: StatTotals;
  bestClass: PlayerClass | null;
  /**
   * Headshots over all-mode kills, 0..1. Null falls back to the absolute count.
   *
   * The percentage exists because the absolute number is not comparable with the
   * Kills tile beside it: headshots include bot kills and `kills` does not, so a
   * member showed 7.179 kills and 7.720 headshots. See headshotRate.
   */
  headshotRate?: number | null;
  /**
   * Sortable stats this member leads in the clan. The matching tiles get a
   * crown. K/D has no tile here, so a K/D lead shows up on /membros only.
   */
  leadsIn?: StatKey[];
  /**
   * Collectables and XP from the game. Omitted entirely on surfaces that do not
   * collect them, so this component stays usable outside the profile page.
   */
  game?: GameProgressTiles;
  className?: string;
}

export function PlayerStats({
  stats,
  bestClass,
  headshotRate,
  leadsIn,
  game,
  className,
}: PlayerStatsProps) {
  const items: {
    icon: LucideIcon;
    label: string;
    value: string;
    color: string;
    /** Set when this tile maps to a stat members can lead. */
    statKey?: StatKey;
  }[] = [
    {
      icon: Crosshair,
      label: "Kills",
      value: formatNumber(stats.kills),
      color: "text-red-500",
      statKey: "kills",
    },
    { icon: Skull, label: "Deaths", value: formatNumber(stats.deaths), color: "text-zinc-400" },
    {
      icon: HeartPulse,
      label: "Revives",
      value: formatNumber(stats.revives),
      color: "text-emerald-500",
    },
    {
      icon: Handshake,
      label: "Assists",
      value: formatNumber(stats.assists),
      color: "text-sky-400",
    },
    { icon: Trophy, label: "Vitórias", value: formatNumber(stats.wins), color: "text-yellow-500" },
    {
      icon: TrendingDown,
      label: "Derrotas",
      value: formatNumber(stats.losses),
      color: "text-orange-500",
    },
    {
      icon: Gamepad2,
      label: "Partidas",
      value: formatNumber(totalMatches(stats)),
      color: "text-violet-400",
      statKey: "matches",
    },
    {
      icon: Clock,
      label: "Horas jogadas",
      value: formatHours(stats.timePlayedMinutes),
      color: "text-cyan-400",
      statKey: "hours",
    },
    {
      icon: Target,
      // Percentage when we can compute it honestly, absolute when we cannot.
      // The label changes with the unit so the tile never shows "12%" under a
      // heading that promises a count.
      label: headshotRate === null || headshotRate === undefined ? "Headshots" : "Headshots %",
      value:
        headshotRate === null || headshotRate === undefined
          ? formatNumber(stats.headshots)
          : formatHeadshotRate(headshotRate),
      color: "text-rose-500",
    },
    {
      icon: Zap,
      label: "Kills/partida",
      value: formatKillsPerMatch(killsPerMatch(stats)),
      color: "text-amber-500",
    },
    {
      icon: Flag,
      label: "Objetivos",
      value: formatNumber(stats.objectivesCaptured),
      color: "text-primary",
    },
    {
      icon: Shield,
      label: "Melhor classe",
      value: bestClass ? CLASS_LABEL[bestClass] : "—",
      color: "text-teal-400",
    },
  ];

  if (game) {
    // Collectables and XP. Rendered with "—" when null rather than hidden, because
    // for these the empty state is temporary and expected: the profile pass reads 10
    // members per cycle, so a new member's tiles fill in within a few hours. A tile
    // that disappears and comes back would read as a bug.
    items.push(
      {
        icon: Award,
        label: "Insígnias",
        value: game.badgeCount === null ? "—" : formatNumber(game.badgeCount),
        color: "text-yellow-400",
      },
      {
        icon: Dog,
        label: "Dog tags",
        value: game.dogTagCount === null ? "—" : formatNumber(game.dogTagCount),
        color: "text-lime-400",
      },
      {
        icon: Sparkles,
        label: "XP total",
        // Zero means the newest snapshot predates the column, not an account with
        // no XP: a profile empty enough to have none never reaches a snapshot.
        value: game.xpTotal > 0 ? formatCompactNumber(game.xpTotal) : "—",
        color: "text-fuchsia-400",
      },
    );

    // ONLY WHEN THERE IS A DIVISION, unlike the three above. Ranked Redsec is niche
    // and the source answers "Unranked" for most of the roster, which the collector
    // stores as null — so a permanent tile here would be a dash on nearly every
    // profile, which says nothing and costs a slot in the grid. Present means earned.
    if (game.competitiveRankName) {
      items.push({
        icon: Swords,
        label: game.competitiveRankMode ? `Ranked ${game.competitiveRankMode}` : "Ranked",
        value: game.competitiveRankName,
        color: "text-indigo-400",
      });
    }
  }

  return (
    // Three columns at the top end, not four (clan owner, 2026-07-29): the tiles
    // stop being a wall of small numbers, and the width matches the single-column
    // game panel that now sits above it.
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3", className)}>
      {items.map(({ icon: Icon, label, value, color, statKey }) => {
        const leadLabel = statKey && leadsIn?.includes(statKey) ? STAT_KEY_LABEL[statKey] : null;
        const leads = leadLabel !== null;
        return (
          <div
            key={label}
            className={cn(
              "bg-secondary/80 flex items-center gap-2.5 rounded-md border px-3 py-2 backdrop-blur-sm",
              // Border only: a yellow tint here would replace bg-secondary/80 in
              // the class merge and leave the tile transparent over the page
              // background image. The crown already carries the signal.
              leads && "border-yellow-500/50",
            )}
          >
            <Icon className={cn("size-4 shrink-0", color)} />
            <div className="min-w-0">
              <p className="flex items-center gap-1 font-mono text-sm leading-tight font-semibold tabular-nums">
                {value}
                {leadLabel ? (
                  <Crown
                    className="size-3 shrink-0 text-yellow-400"
                    aria-label={`Líder do clã em ${leadLabel}`}
                  />
                ) : null}
              </p>
              <p className="text-muted-foreground truncate text-[11px] tracking-wide uppercase">
                {label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
