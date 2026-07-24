// Pure, testable stat derivations. No DB, no React — feed it plain data.
// K/D, win-rate and rankings are computed here (never persisted). "This month"
// = latest snapshot minus the earliest snapshot within the reference month.

import { isSameMonth } from "date-fns";

export type StatTotals = {
  kills: number;
  deaths: number;
  matchesPlayed: number;
  wins: number;
  score: number;
  timePlayedMinutes: number;
};

export type SnapshotLike = StatTotals & { capturedAt: Date };

const STAT_KEYS: (keyof StatTotals)[] = [
  "kills",
  "deaths",
  "matchesPlayed",
  "wins",
  "score",
  "timePlayedMinutes",
];

export function emptyTotals(): StatTotals {
  return {
    kills: 0,
    deaths: 0,
    matchesPlayed: 0,
    wins: 0,
    score: 0,
    timePlayedMinutes: 0,
  };
}

/** Kill/death ratio. With no deaths, the ratio is the kill count itself. */
export function computeKd(kills: number, deaths: number): number {
  if (deaths <= 0) return kills;
  return kills / deaths;
}

/** Win rate as a 0..1 fraction. Zero matches → 0. */
export function computeWinRate(wins: number, matchesPlayed: number): number {
  if (matchesPlayed <= 0) return 0;
  return wins / matchesPlayed;
}

/** Most recent snapshot (cumulative totals), or null when there are none. */
export function latestSnapshot<T extends { capturedAt: Date }>(
  snapshots: T[],
): T | null {
  if (snapshots.length === 0) return null;
  return snapshots.reduce((latest, s) =>
    s.capturedAt > latest.capturedAt ? s : latest,
  );
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
export function deltaForMonth(
  snapshots: SnapshotLike[],
  reference: Date,
): StatTotals {
  const inMonth = snapshots
    .filter((s) => isSameMonth(s.capturedAt, reference))
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  if (inMonth.length < 2) return emptyTotals();
  return subtractTotals(inMonth[inMonth.length - 1], inMonth[0]);
}

export type RankMetric =
  | "matchesPlayed"
  | "kills"
  | "score"
  | "kd"
  | "winRate"
  | "medals";

export type RankableMember = {
  memberId: string;
  totals: StatTotals;
  medalCount: number;
};

export type Ranked<T> = T & { rank: number; value: number };

export function metricValue(member: RankableMember, metric: RankMetric): number {
  switch (metric) {
    case "matchesPlayed":
      return member.totals.matchesPlayed;
    case "kills":
      return member.totals.kills;
    case "score":
      return member.totals.score;
    case "kd":
      return computeKd(member.totals.kills, member.totals.deaths);
    case "winRate":
      return computeWinRate(member.totals.wins, member.totals.matchesPlayed);
    case "medals":
      return member.medalCount;
  }
}

/**
 * Rank members by a metric, highest first, using competition ranking so ties
 * share a rank (1, 2, 2, 4). Does not mutate the input array.
 */
export function rankMembers<T extends RankableMember>(
  members: T[],
  metric: RankMetric,
): Ranked<T>[] {
  const scored = members
    .map((m) => ({ ...m, value: metricValue(m, metric) }))
    .sort((a, b) => b.value - a.value);

  let rank = 0;
  let previous: number | null = null;
  return scored.map((m, index) => {
    if (previous === null || m.value !== previous) {
      rank = index + 1;
      previous = m.value;
    }
    return { ...m, rank };
  });
}
