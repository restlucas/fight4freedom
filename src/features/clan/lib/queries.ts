// Data access for the clan vitrine. Server-only (uses the Prisma client).
// Pages stay thin: they call these and pass the result to presentational
// components.

import type {
  MedalTier,
  MemberRole,
  Platform,
  PlayerClass,
} from "@prisma/client";

import { db } from "@/lib/db";
import {
  computeKd,
  computeWinRate,
  emptyTotals,
  totalMatches,
  type StatTotals,
} from "@/lib/stats/snapshots";

export type MemberOverview = {
  id: string;
  nickname: string;
  platform: Platform;
  role: MemberRole;
  avatarUrl: string | null;
  medalCount: number;
  bestClass: PlayerClass | null;
  totals: StatTotals;
};

function totalsFromSnapshot(
  snapshot: {
    kills: number;
    deaths: number;
    wins: number;
    losses: number;
    assists: number;
    revives: number;
    headshots: number;
    objectivesCaptured: number;
    timePlayedMinutes: number;
  } | null,
): StatTotals {
  if (!snapshot) return emptyTotals();
  return {
    kills: snapshot.kills,
    deaths: snapshot.deaths,
    wins: snapshot.wins,
    losses: snapshot.losses,
    assists: snapshot.assists,
    revives: snapshot.revives,
    headshots: snapshot.headshots,
    objectivesCaptured: snapshot.objectivesCaptured,
    timePlayedMinutes: snapshot.timePlayedMinutes,
  };
}

/** Active members with their latest snapshot totals, best class and medals. */
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
    const latest = m.snapshots[0] ?? null;
    return {
      id: m.id,
      nickname: m.nickname,
      platform: m.platform,
      role: m.role,
      avatarUrl: m.avatarUrl,
      medalCount: m._count.medals,
      bestClass: latest?.bestClass ?? null,
      totals: totalsFromSnapshot(latest),
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
    ? members.reduce((sum, m) => sum + computeKd(m.totals.kills, m.totals.deaths), 0) /
      totalMembers
    : 0;
  const averageWinRate = totalMembers
    ? members.reduce(
        (sum, m) => sum + computeWinRate(m.totals.wins, m.totals.losses),
        0,
      ) / totalMembers
    : 0;
  return { totalMembers, totalMedalsAwarded, averageKd, averageWinRate };
}

export type ProfileMedal = {
  id: string;
  name: string;
  tier: MedalTier;
  icon: string | null;
  criteria: string | null;
  description: string | null;
  awardedAt: Date;
};

export type ProgressionPoint = {
  capturedAt: Date;
  kd: number;
  kills: number;
  matches: number;
};

export type MemberProfile = {
  id: string;
  nickname: string;
  platform: Platform;
  role: MemberRole;
  avatarUrl: string | null;
  joinedAt: Date | null;
  bestClass: PlayerClass | null;
  medalCount: number;
  totals: StatTotals;
  medals: ProfileMedal[];
  progression: ProgressionPoint[];
};

/** Full detail for a single member's profile page. Null when not found. */
export async function getMemberProfile(id: string): Promise<MemberProfile | null> {
  const member = await db.member.findUnique({
    where: { id },
    include: {
      snapshots: { orderBy: { capturedAt: "asc" } },
      medals: { include: { medal: true }, orderBy: { awardedAt: "desc" } },
    },
  });
  if (!member) return null;

  const latest = member.snapshots.at(-1) ?? null;

  return {
    id: member.id,
    nickname: member.nickname,
    platform: member.platform,
    role: member.role,
    avatarUrl: member.avatarUrl,
    joinedAt: member.joinedAt,
    bestClass: latest?.bestClass ?? null,
    medalCount: member.medals.length,
    totals: latest
      ? {
          kills: latest.kills,
          deaths: latest.deaths,
          wins: latest.wins,
          losses: latest.losses,
          assists: latest.assists,
          revives: latest.revives,
          headshots: latest.headshots,
          objectivesCaptured: latest.objectivesCaptured,
          timePlayedMinutes: latest.timePlayedMinutes,
        }
      : emptyTotals(),
    medals: member.medals.map((um) => ({
      id: um.medal.id,
      name: um.medal.name,
      tier: um.medal.tier,
      icon: um.medal.icon,
      criteria: um.medal.criteria,
      description: um.medal.description,
      awardedAt: um.awardedAt,
    })),
    progression: member.snapshots.map((s) => ({
      capturedAt: s.capturedAt,
      kd: computeKd(s.kills, s.deaths),
      kills: s.kills,
      matches: totalMatches(s),
    })),
  };
}
