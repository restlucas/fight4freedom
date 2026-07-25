// Data access for the clan vitrine. Server-only (uses the Prisma client).
// Pages stay thin: they call these and pass the result to presentational
// components.
//
// Every query that touches the database goes through `cachedQuery`, so a single
// read serves all visitors for the revalidation window. Two consequences worth
// remembering (both explained in src/lib/cache.ts):
//   - Return values must be JSON-safe, so dates are exposed as ISO strings.
//   - Arguments become part of the cache key, so no volatile values.

import type {
  MedalTier,
  MemberRole,
  Platform,
  PlayerClass,
} from "@prisma/client";

import { cachedQuery, CACHE_TAG } from "@/lib/cache";
import { db } from "@/lib/db";
import { monthKeyToReference } from "@/lib/month";
import { computePoints } from "@/lib/stats/points";
import {
  computeKd,
  computeWinRate,
  deltaForMonth,
  emptyTotals,
  totalMatches,
  withCompetitionRanks,
  type StatTotals,
} from "@/lib/stats/snapshots";

import { findStatLeaders, type StatLeaders } from "./stat-keys";

/** How many medals the listing shows before collapsing into a "+N" chip. */
export const MEDAL_PREVIEW_LIMIT = 5;

export type MemberMedalPreview = {
  id: string;
  name: string;
  tier: MedalTier;
  icon: string | null;
  imageUrl: string | null;
};

export type MemberOverview = {
  id: string;
  nickname: string;
  platform: Platform;
  /** Public id on the platform, shown on hover over the platform icon. */
  platformId: string | null;
  role: MemberRole;
  avatarUrl: string | null;
  /** Cumulative career points; the rank is derived in src/lib/ranks.ts. */
  rankPoints: number;
  /** Total earned, including the ones beyond `medals`. */
  medalCount: number;
  /** Most recently awarded first, capped at MEDAL_PREVIEW_LIMIT. */
  medals: MemberMedalPreview[];
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
export const getMembersOverview = cachedQuery(
  "members-overview",
  [CACHE_TAG.members, CACHE_TAG.medals, CACHE_TAG.stats],
  async (): Promise<MemberOverview[]> => {
    const members = await db.member.findMany({
      where: { active: true },
      include: {
        snapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
        medals: {
          orderBy: { awardedAt: "desc" },
          take: MEDAL_PREVIEW_LIMIT,
          include: {
            medal: {
              select: {
                id: true,
                name: true,
                tier: true,
                icon: true,
                imageUrl: true,
              },
            },
          },
        },
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
        platformId: m.platformId,
        role: m.role,
        avatarUrl: m.avatarUrl,
        rankPoints: m.rankPoints,
        medalCount: m._count.medals,
        medals: m.medals.map((award) => award.medal),
        bestClass: latest?.bestClass ?? null,
        totals: totalsFromSnapshot(latest),
      };
    });
  },
);

/**
 * Who currently leads each sortable stat. Derived from the same overview the
 * listing uses, so the crowns always match what is on screen. Nothing is
 * persisted for this — no schema change needed.
 */
export async function getStatLeaders(): Promise<StatLeaders> {
  const members = await getMembersOverview();
  return findStatLeaders(members);
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

export type RankingEntry = {
  rank: number;
  memberId: string;
  nickname: string;
  avatarUrl: string | null;
  platform: Platform;
  points: number;
  /** Progress made during the reference month, not lifetime totals. */
  progress: {
    kills: number;
    matches: number;
    kd: number;
    timePlayedMinutes: number;
  };
};

/**
 * Monthly ranking: every active member scored by their progress during the
 * given season. Ranks are always computed over the whole roster (filtering and
 * paging happen after this), so rank #7 stays #7 inside a search result.
 *
 * Takes a `monthKey` ("2026-07"), not a Date: the argument is part of the cache
 * key, and an instant would change on every request.
 */
export const getMonthlyRanking = cachedQuery(
  "monthly-ranking",
  [CACHE_TAG.members, CACHE_TAG.stats],
  async (month: string): Promise<RankingEntry[]> => {
    const reference = monthKeyToReference(month);
    const members = await db.member.findMany({
      where: { active: true },
      select: {
        id: true,
        nickname: true,
        avatarUrl: true,
        platform: true,
        snapshots: {
          select: {
            capturedAt: true,
            kills: true,
            deaths: true,
            wins: true,
            losses: true,
            assists: true,
            revives: true,
            headshots: true,
            objectivesCaptured: true,
            timePlayedMinutes: true,
          },
        },
      },
    });

    const scored = members.map((member) => {
      const progress = deltaForMonth(member.snapshots, reference);
      return {
        memberId: member.id,
        nickname: member.nickname,
        avatarUrl: member.avatarUrl,
        platform: member.platform,
        points: computePoints(progress),
        progress: {
          kills: progress.kills,
          matches: totalMatches(progress),
          kd: computeKd(progress.kills, progress.deaths),
          timePlayedMinutes: progress.timePlayedMinutes,
        },
      };
    });

    // Alphabetical first so members tied on points keep a stable, fair order.
    scored.sort((a, b) => a.nickname.localeCompare(b.nickname, "pt-BR"));

    // `value` from the ranking helper duplicates `points`, so it is dropped here.
    return withCompetitionRanks(scored, (entry) => entry.points).map((entry) => ({
      rank: entry.rank,
      memberId: entry.memberId,
      nickname: entry.nickname,
      avatarUrl: entry.avatarUrl,
      platform: entry.platform,
      points: entry.points,
      progress: entry.progress,
    }));
  },
);

export type ProfileMedal = {
  id: string;
  name: string;
  tier: MedalTier;
  icon: string | null;
  imageUrl: string | null;
  criteria: string | null;
  description: string | null;
  /** ISO instant — the cache is JSON, so dates never cross it as Date. */
  awardedAt: string;
};

export type MedalHolder = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
};

export type MedalCatalogEntry = {
  id: string;
  name: string;
  description: string | null;
  criteria: string | null;
  tier: MedalTier;
  icon: string | null;
  imageUrl: string | null;
  holders: MedalHolder[];
};

/**
 * The clan's medal catalog with everyone who earned each medal.
 * Rarest tier first (the enum is declared common -> special), then by name.
 */
export const getMedalsCatalog = cachedQuery(
  "medals-catalog",
  [CACHE_TAG.medals, CACHE_TAG.members],
  async (): Promise<MedalCatalogEntry[]> => {
    const medals = await db.medal.findMany({
      include: {
        members: {
          orderBy: { awardedAt: "desc" },
          include: {
            member: { select: { id: true, nickname: true, avatarUrl: true } },
          },
        },
      },
      orderBy: [{ tier: "desc" }, { name: "asc" }],
    });

    return medals.map((medal) => ({
      id: medal.id,
      name: medal.name,
      description: medal.description,
      criteria: medal.criteria,
      tier: medal.tier,
      icon: medal.icon,
      imageUrl: medal.imageUrl,
      holders: medal.members.map((mm) => ({
        id: mm.member.id,
        nickname: mm.member.nickname,
        avatarUrl: mm.member.avatarUrl,
      })),
    }));
  },
);

export type ProgressionPoint = {
  /** ISO instant — see ProfileMedal.awardedAt. */
  capturedAt: string;
  kd: number;
  kills: number;
  matches: number;
};

export type MemberProfile = {
  id: string;
  nickname: string;
  platform: Platform;
  platformId: string | null;
  role: MemberRole;
  avatarUrl: string | null;
  rankPoints: number;
  /** ISO instant (date-only column) — see ProfileMedal.awardedAt. */
  joinedAt: string | null;
  bestClass: PlayerClass | null;
  medalCount: number;
  totals: StatTotals;
  medals: ProfileMedal[];
  progression: ProgressionPoint[];
};

/** Full detail for a single member's profile page. Null when not found. */
export const getMemberProfile = cachedQuery(
  "member-profile",
  [CACHE_TAG.members, CACHE_TAG.medals, CACHE_TAG.stats],
  async (id: string): Promise<MemberProfile | null> => {
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
      platformId: member.platformId,
      role: member.role,
      avatarUrl: member.avatarUrl,
      rankPoints: member.rankPoints,
      joinedAt: member.joinedAt?.toISOString() ?? null,
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
        imageUrl: um.medal.imageUrl,
        criteria: um.medal.criteria,
        description: um.medal.description,
        awardedAt: um.awardedAt.toISOString(),
      })),
      progression: member.snapshots.map((s) => ({
        capturedAt: s.capturedAt.toISOString(),
        kd: computeKd(s.kills, s.deaths),
        kills: s.kills,
        matches: totalMatches(s),
      })),
    };
  },
);
