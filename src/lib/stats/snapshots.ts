// Pure, testable stat derivations. No DB, no React — feed it plain data.
// Only raw counters are stored; matches (wins+losses), K/D, kills-per-match,
// win rate and hours are derived here. "This month" = latest snapshot minus the
// earliest snapshot within the reference month.

import { isSameMonth } from "date-fns";

export type StatTotals = {
  kills: number;
  deaths: number;
  wins: number;
  losses: number;
  assists: number;
  revives: number;
  headshots: number;
  objectivesCaptured: number;
  timePlayedMinutes: number;
};

export type SnapshotLike = StatTotals & { capturedAt: Date };

const STAT_KEYS: (keyof StatTotals)[] = [
  "kills",
  "deaths",
  "wins",
  "losses",
  "assists",
  "revives",
  "headshots",
  "objectivesCaptured",
  "timePlayedMinutes",
];

export function emptyTotals(): StatTotals {
  return {
    kills: 0,
    deaths: 0,
    wins: 0,
    losses: 0,
    assists: 0,
    revives: 0,
    headshots: 0,
    objectivesCaptured: 0,
    timePlayedMinutes: 0,
  };
}

/** Matches played = wins + losses (BF6 has no draws in ranked modes). */
export function totalMatches(totals: StatTotals): number {
  return totals.wins + totals.losses;
}

/** Kill/death ratio. With no deaths, the ratio is the kill count itself. */
export function computeKd(kills: number, deaths: number): number {
  if (deaths <= 0) return kills;
  return kills / deaths;
}

/** Win rate as a 0..1 fraction. Zero matches → 0. */
export function computeWinRate(wins: number, losses: number): number {
  const matches = wins + losses;
  if (matches <= 0) return 0;
  return wins / matches;
}

/** Average kills per match. Zero matches → 0. */
export function killsPerMatch(totals: StatTotals): number {
  const matches = totalMatches(totals);
  if (matches <= 0) return 0;
  return totals.kills / matches;
}

/** Hours played from stored minutes. */
export function hoursPlayed(timePlayedMinutes: number): number {
  return timePlayedMinutes / 60;
}

/** Most recent snapshot (cumulative totals), or null when there are none. */
export function latestSnapshot<T extends { capturedAt: Date }>(snapshots: T[]): T | null {
  if (snapshots.length === 0) return null;
  return snapshots.reduce((latest, s) => (s.capturedAt > latest.capturedAt ? s : latest));
}

function subtractTotals(a: StatTotals, b: StatTotals): StatTotals {
  const out = emptyTotals();
  for (const key of STAT_KEYS) out[key] = a[key] - b[key];
  return out;
}

/**
 * Activity within the reference month: last snapshot of the month minus the
 * first. Fewer than two snapshots in the month → all zeros.
 */
export function deltaForMonth(snapshots: SnapshotLike[], reference: Date): StatTotals {
  const inMonth = snapshots
    .filter((s) => isSameMonth(s.capturedAt, reference))
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  if (inMonth.length < 2) return emptyTotals();
  return subtractTotals(inMonth[inMonth.length - 1], inMonth[0]);
}

/** The counters the collector compares to decide "played since last snapshot". */
export type ActivityCounters = Pick<
  StatTotals,
  "kills" | "deaths" | "wins" | "losses" | "timePlayedMinutes"
>;

/**
 * Whether freshly fetched counters differ from the member's latest snapshot.
 * Any movement counts — matches (wins+losses), kills, deaths or play time.
 * No previous snapshot means the first collection, which always writes.
 * Deliberately limited to these five: a provider quirk in a secondary metric
 * (assists, revives) must never flood the snapshot table by itself.
 */
export function hasNewActivity(
  latest: ActivityCounters | null,
  current: ActivityCounters,
): boolean {
  if (!latest) return true;
  return (
    latest.kills !== current.kills ||
    latest.deaths !== current.deaths ||
    latest.wins !== current.wins ||
    latest.losses !== current.losses ||
    latest.timePlayedMinutes !== current.timePlayedMinutes
  );
}

export type RankMetric = "kills" | "matches" | "revives" | "assists" | "kd" | "winRate" | "medals";

export type RankableMember = {
  memberId: string;
  totals: StatTotals;
  medalCount: number;
};

export type Ranked<T> = T & { rank: number; value: number };

export function metricValue(member: RankableMember, metric: RankMetric): number {
  switch (metric) {
    case "kills":
      return member.totals.kills;
    case "matches":
      return totalMatches(member.totals);
    case "revives":
      return member.totals.revives;
    case "assists":
      return member.totals.assists;
    case "kd":
      return computeKd(member.totals.kills, member.totals.deaths);
    case "winRate":
      return computeWinRate(member.totals.wins, member.totals.losses);
    case "medals":
      return member.medalCount;
  }
}

/**
 * Sort by a value, highest first, and attach competition ranks so ties share a
 * rank (1, 2, 2, 4). Does not mutate the input array.
 */
export function withCompetitionRanks<T>(items: T[], valueOf: (item: T) => number): Ranked<T>[] {
  const scored = items
    .map((item) => ({ ...item, value: valueOf(item) }))
    .sort((a, b) => b.value - a.value);

  let rank = 0;
  let previous: number | null = null;
  return scored.map((item, index) => {
    if (previous === null || item.value !== previous) {
      rank = index + 1;
      previous = item.value;
    }
    return { ...item, rank };
  });
}

/** Rank members by one of the predefined metrics, highest first. */
export function rankMembers<T extends RankableMember>(
  members: T[],
  metric: RankMetric,
): Ranked<T>[] {
  return withCompetitionRanks(members, (m) => metricValue(m, metric));
}
