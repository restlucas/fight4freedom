import {
  Clock,
  Crosshair,
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
import {
  killsPerMatch,
  totalMatches,
  type StatTotals,
} from "@/lib/stats/snapshots";

import {
  CLASS_LABEL,
  formatHours,
  formatKillsPerMatch,
  formatNumber,
} from "../lib/format";

interface PlayerStatsProps {
  stats: StatTotals;
  bestClass: PlayerClass | null;
  className?: string;
}

export function PlayerStats({ stats, bestClass, className }: PlayerStatsProps) {
  const items: {
    icon: LucideIcon;
    label: string;
    value: string;
    color: string;
  }[] = [
    { icon: Crosshair, label: "Kills", value: formatNumber(stats.kills), color: "text-red-500" },
    { icon: Skull, label: "Deaths", value: formatNumber(stats.deaths), color: "text-zinc-400" },
    { icon: HeartPulse, label: "Revives", value: formatNumber(stats.revives), color: "text-emerald-500" },
    { icon: Handshake, label: "Assists", value: formatNumber(stats.assists), color: "text-sky-400" },
    { icon: Trophy, label: "Vitórias", value: formatNumber(stats.wins), color: "text-yellow-500" },
    { icon: TrendingDown, label: "Derrotas", value: formatNumber(stats.losses), color: "text-orange-500" },
    { icon: Gamepad2, label: "Partidas", value: formatNumber(totalMatches(stats)), color: "text-violet-400" },
    { icon: Clock, label: "Horas jogadas", value: formatHours(stats.timePlayedMinutes), color: "text-cyan-400" },
    { icon: Target, label: "Headshots", value: formatNumber(stats.headshots), color: "text-rose-500" },
    { icon: Zap, label: "Kills/partida", value: formatKillsPerMatch(killsPerMatch(stats)), color: "text-amber-500" },
    { icon: Flag, label: "Objetivos", value: formatNumber(stats.objectivesCaptured), color: "text-primary" },
    { icon: Shield, label: "Melhor classe", value: bestClass ? CLASS_LABEL[bestClass] : "—", color: "text-teal-400" },
  ];

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4",
        className,
      )}
    >
      {items.map(({ icon: Icon, label, value, color }) => (
        <div
          key={label}
          className="bg-secondary/40 flex items-center gap-2.5 rounded-md px-3 py-2"
        >
          <Icon className={cn("size-4 shrink-0", color)} />
          <div className="min-w-0">
            <p className="font-mono text-sm leading-tight font-semibold tabular-nums">
              {value}
            </p>
            <p className="text-muted-foreground truncate text-[11px] tracking-wide uppercase">
              {label}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
