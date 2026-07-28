import {
  Clock,
  Crosshair,
  Crown,
  Flag,
  Gamepad2,
  Handshake,
  HeartPulse,
  Shield,
  Skull,
  Target,
  TrendingDown,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { PlayerClass } from "@prisma/client";
import { cn } from "@/lib/utils";
import { killsPerMatch, totalMatches, type StatTotals } from "@/lib/stats/snapshots";

import { CLASS_LABEL, formatHours, formatKillsPerMatch, formatNumber } from "../lib/format";
import { STAT_KEY_LABEL, type StatKey } from "../lib/stat-keys";

interface PlayerStatsProps {
  stats: StatTotals;
  bestClass: PlayerClass | null;
  /**
   * Sortable stats this member leads in the clan. The matching tiles get a
   * crown. K/D has no tile here, so a K/D lead shows up on /membros only.
   */
  leadsIn?: StatKey[];
  className?: string;
}

export function PlayerStats({ stats, bestClass, leadsIn, className }: PlayerStatsProps) {
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
      label: "Headshots",
      value: formatNumber(stats.headshots),
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

  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4", className)}>
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
