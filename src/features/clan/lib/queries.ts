// Data access for the clan vitrine. Server-only (uses the Prisma client).
// Pages stay thin: they call these and pass the result to presentational
// components.

import type { MemberRole, Platform } from "@prisma/client";

import { db } from "@/lib/db";
import {
  computeKd,
  computeWinRate,
  emptyTotals,
  type StatTotals,
} from "@/lib/stats/snapshots";

export type MemberOverview = {
  id: string;
  nickname: string;
  platform: Platform;
  role: MemberRole;
  avatarUrl: string | null;
  medalCount: number;
  totals: StatTotals;
  kd: number;
  winRate: number;
};

/** Active members with their latest cumulative stats and medal count. */
export async function getMembersOverview(): Promise<MemberOverview[]> {
  const members = await db.member.findMany({
    where: { active: true },
    include: {
      snapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
      _count: { select: { medals: true } },
    },
    orderBy: [{ role: "desc" }, { nickname: "asc" }],
  });

  return members.map((m) => {
    const latest = m.snapshots[0];
    const totals: StatTotals = latest
      ? {
          kills: latest.kills,
          deaths: latest.deaths,
          matchesPlayed: latest.matchesPlayed,
          wins: latest.wins,
          score: latest.score,
          timePlayedMinutes: latest.timePlayedMinutes,
        }
      : emptyTotals();

    return {
      id: m.id,
      nickname: m.nickname,
      platform: m.platform,
      role: m.role,
      avatarUrl: m.avatarUrl,
      medalCount: m._count.medals,
      totals,
      kd: computeKd(totals.kills, totals.deaths),
      winRate: computeWinRate(totals.wins, totals.matchesPlayed),
    };
  });
}

export type ClanStats = {
  totalMembers: number;
  totalMedalsAwarded: number;
  averageKd: number;
  averageWinRate: number;
};

/** Aggregated headline stats for the home page (active members). */
export async function getClanStats(): Promise<ClanStats> {
  const members = await getMembersOverview();
  const totalMembers = members.length;
  const totalMedalsAwarded = members.reduce((sum, m) => sum + m.medalCount, 0);
  const averageKd = totalMembers
    ? members.reduce((sum, m) => sum + m.kd, 0) / totalMembers
    : 0;
  const averageWinRate = totalMembers
    ? members.reduce((sum, m) => sum + m.winRate, 0) / totalMembers
    : 0;
  return { totalMembers, totalMedalsAwarded, averageKd, averageWinRate };
}
