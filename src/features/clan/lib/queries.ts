// Data access for the clan vitrine. Server-only (uses the Prisma client).
// Pages stay thin: they call these and pass the result to presentational
// components.
//
// Every query that touches the database goes through `cachedQuery`, so a single
// read serves all visitors for the revalidation window. Two consequences worth
// remembering (both explained in src/lib/cache.ts):
//   - Return values must be JSON-safe, so dates are exposed as ISO strings.
//   - Arguments become part of the cache key, so no volatile values.

import type { ClanEventKind, MedalTier, MemberRole, Platform, PlayerClass } from "@prisma/client";

import { cachedQuery, CACHE_TAG } from "@/lib/cache";
import { db } from "@/lib/db";
import { monthKeyToReference } from "@/lib/month";
import { computePoints } from "@/lib/stats/points";
import {
  allModeKillsOf,
  computeKd,
  computeWinRate,
  deltaForMonth,
  headshotRate,
  pickTotals,
  STAT_TOTALS_SELECT,
  totalMatches,
  withOrdinalRanks,
  type StatTotals,
} from "@/lib/stats/snapshots";

import { buildProgression, type ProgressionPoint } from "./progression";
import { findStatLeaders, type StatLeaders } from "./stat-keys";

/**
 * How far back the ranking compares to, for the movement arrows.
 *
 * MEASURED, not picked (2026-07-29, against the real board of 26 scoring members):
 *
 *   | window        | arrows | avg places | biggest |
 *   | last cycle    |      0 |          0 |       0 |
 *   | 20 min        |      0 |          0 |       0 |
 *   | 1 h           |      7 |        1.4 |       2 |
 *   | 3 h           |     21 |        2.5 |      10 |
 *   | 6 h           |     19 |        4.2 |       8 |
 *   | 24 h          |     16 |        6.4 |      12 |
 *
 * Three hours is where movement is visible and its magnitude is still honest.
 *
 * WHY NOT THE COLLECTION CADENCE, which is the obvious guess: gaining points in
 * one 20-minute cycle almost never swaps a position — neighbours on this board sit
 * hundreds of points apart and a 20-minute session is worth about fifty — so the
 * window produces no arrows at all. It also makes the arrow vanish at the next
 * cycle, hiding a climb that actually happened, and a window equal to the cadence
 * lands on the cycle boundary, so the last snapshot falls in or out of the cut
 * depending on the instant the page renders.
 *
 * The BOARD does follow the 20-minute cadence, and always did: the stats tag is
 * purged every cycle. This constant is a different axis — what to compare against,
 * not how fresh the data is.
 */
const MOVEMENT_WINDOW_MS = 3 * 60 * 60 * 1000;

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

/** Latest snapshot to career totals. `pickTotals` covers every counter. */
function totalsFromSnapshot(snapshot: StatTotals | null): StatTotals {
  return pickTotals(snapshot);
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
    ? members.reduce((sum, m) => sum + computeKd(m.totals.kills, m.totals.deaths), 0) / totalMembers
    : 0;
  const averageWinRate = totalMembers
    ? members.reduce((sum, m) => sum + computeWinRate(m.totals.wins, m.totals.losses), 0) /
      totalMembers
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
  /**
   * Where this member stood MOVEMENT_WINDOW_MS ago (3 h), so the board can show
   * movement.
   *
   * Null means "no movement to show", and it covers three cases on purpose:
   * a member with no points this month (their position is alphabetical filler, not
   * a standing they can lose), a member who had no points at the start of the
   * window (their first session is an entry, not an overtake), and a season that is
   * already closed.
   */
  previousRank: number | null;
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
/**
 * Season keys that actually have a board, newest first (e.g. ["2026-07", "2026-06"]).
 *
 * A month only counts when some member has at least TWO snapshots inside it,
 * because `deltaForMonth` scores last-minus-first: with a single snapshot every
 * member's progress is zero, and offering that month in the picker would show an
 * all-zero board that looks like a bug.
 *
 * The 3-hour shift reproduces `monthKey`'s Brasília calendar in SQL — without it
 * a snapshot captured at 22:00 on the 31st would be filed under the next month.
 */
export const getRankingMonths = cachedQuery(
  "ranking-months",
  [CACHE_TAG.stats],
  async (): Promise<string[]> => {
    const rows = await db.$queryRaw<{ month: string }[]>`
      select month
      from (
        select
          to_char(captured_at - interval '3 hours', 'YYYY-MM') as month,
          member_id,
          count(*) as snapshots
        from stat_snapshot
        group by 1, 2
      ) per_member
      where snapshots >= 2
      group by month
      order by month desc
    `;
    return rows.map((row) => row.month);
  },
);

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
          // eaNucleusId: deltaForMonth refuses to subtract across accounts.
          select: { capturedAt: true, eaNucleusId: true, ...STAT_TOTALS_SELECT },
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

    // MOVEMENT: the same board, scored as it stood at the start of the window.
    // Same members, same rules, only the snapshots after the cutoff withheld.
    //
    // `new Date()` here does NOT reach the cache key — the key is the month, and
    // that is deliberate. What the clock does affect is the cached VALUE, bounded
    // two ways: the 300 s TTL and the stats tag, which every collection purges.
    // A "since yesterday" window drifting by minutes is not a defect; a volatile
    // cache key would be (see src/lib/cache.ts).
    const cutoff = new Date(Date.now() - MOVEMENT_WINDOW_MS);
    const before = withOrdinalRanks(
      members.map((member) => ({
        memberId: member.id,
        nickname: member.nickname,
        points: computePoints(
          deltaForMonth(
            member.snapshots.filter((s) => s.capturedAt <= cutoff),
            reference,
          ),
        ),
      })),
      (entry) => entry.points,
      (a, b) => a.nickname.localeCompare(b.nickname, "pt-BR"),
    );
    // Only members who had a real standing then. A member on zero points was
    // sitting in the alphabetical tail, so "climbed 80 places" would be describing
    // their FIRST session of the month as an overtake of 80 people. Measured on
    // 2026-07-29 that produced +80, +64, +53 and +42 on one board, which reads as
    // a leaderboard in chaos when it was really four people starting to play.
    const previousRankByMember = new Map(
      before.filter((entry) => entry.points > 0).map((entry) => [entry.memberId, entry.rank]),
    );

    // Ordinal, not competition ranks: every row gets its own number. Most of the
    // roster sits on zero points in a fresh month, and sharing one number across
    // that whole tail reads as a bug. Ties break alphabetically so the order is
    // stable and does not depend on how rows came out of the database.
    // `value` from the ranking helper duplicates `points`, so it is dropped here.
    return withOrdinalRanks(
      scored,
      (entry) => entry.points,
      (a, b) => a.nickname.localeCompare(b.nickname, "pt-BR"),
    ).map((entry) => ({
      rank: entry.rank,
      memberId: entry.memberId,
      nickname: entry.nickname,
      avatarUrl: entry.avatarUrl,
      platform: entry.platform,
      points: entry.points,
      // Zero-point members get no arrow: their place on the board is the
      // alphabetical tiebreak, and drawing them a red arrow because somebody
      // above them played would be blaming them for someone else's session.
      previousRank: entry.points > 0 ? (previousRankByMember.get(entry.memberId) ?? null) : null,
      progress: entry.progress,
    }));
  },
);

export type ActivityEvent = {
  id: string;
  kind: ClanEventKind;
  memberId: string;
  nickname: string;
  avatarUrl: string | null;
  /** ISO instants — the cache serializes with JSON (see src/lib/cache.ts). */
  occurredAt: string;
  /** Also the polling cursor: a session grows without a new row appearing. */
  updatedAt: string;
  points: number;
  minutesPlayed: number;
  /** Rank reached, for a promotion. Addresses the insignia artwork too. */
  rankSlug: string | null;
};

/** How many events the feed shows, and the cap the polling endpoint honours. */
export const ACTIVITY_FEED_LIMIT = 8;

/**
 * How far back the feed looks. A week: past that, "recent activity" is history,
 * and a fresh clan with a quiet week is better served by an honest empty state
 * than by a month-old promotion pretending to be news.
 */
const ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The activity feed, newest first.
 *
 * Ordered by `updatedAt`, not `occurredAt`: a session that is still being
 * extended is the most current thing on the page, and ordering by when it started
 * would sink it below a promotion that happened earlier.
 *
 * Not cached, unlike its neighbours here. This one is read by a page AND polled
 * by the browser every 30 s (see /api/activity), and a cached read would answer
 * the poll with the same snapshot for the whole TTL — the poll exists precisely
 * to see through the cache.
 */
export async function getActivityFeed(limit = ACTIVITY_FEED_LIMIT): Promise<ActivityEvent[]> {
  const rows = await db.clanEvent.findMany({
    where: {
      updatedAt: { gte: new Date(Date.now() - ACTIVITY_WINDOW_MS) },
      member: { active: true },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      kind: true,
      occurredAt: true,
      updatedAt: true,
      points: true,
      minutesPlayed: true,
      rankSlug: true,
      member: { select: { id: true, nickname: true, avatarUrl: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    memberId: row.member.id,
    nickname: row.member.nickname,
    avatarUrl: row.member.avatarUrl,
    occurredAt: row.occurredAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    points: row.points,
    minutesPlayed: row.minutesPlayed,
    rankSlug: row.rankSlug,
  }));
}

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
  /**
   * Headshots over ALL-MODE kills, as a 0..1 fraction. Null when the snapshot has
   * no all-mode total to divide by, and the tile falls back to the absolute count.
   *
   * Derived here rather than in the component because the denominator lives in the
   * snapshot's `extra` JSON, which does not belong in the view layer — see
   * headshotRate for why `totals.kills` is the wrong denominator.
   */
  headshotRate: number | null;
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
      totals: pickTotals(latest),
      headshotRate: latest ? headshotRate(latest.headshots, allModeKillsOf(latest.extra)) : null,
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
      progression: buildProgression(member.snapshots),
    };
  },
);
