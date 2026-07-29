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
  objectivesDefended: number;
  objectivesDestroyed: number;
  objectivesArmed: number;
  objectivesDisarmed: number;
  sectorsDefended: number;
  objectiveTimeSeconds: number;
  spots: number;
  healthRestored: number;
  repairs: number;
};

export type SnapshotLike = StatTotals & {
  capturedAt: Date;
  /**
   * EA account the counters came from. Optional so callers that do not score
   * deltas (a member's lifetime totals, for instance) need not select it.
   */
  eaNucleusId?: string | null;
};

/**
 * Every key subtracted when computing a month's progress. Adding a counter to
 * `StatTotals` without listing it here would silently make its monthly delta
 * always zero, so the two are kept adjacent on purpose.
 */
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
  "objectivesDefended",
  "objectivesDestroyed",
  "objectivesArmed",
  "objectivesDisarmed",
  "sectorsDefended",
  "objectiveTimeSeconds",
  "spots",
  "healthRestored",
  "repairs",
];

/**
 * Prisma `select` fragment covering every stored counter. Queries that feed the
 * ranking use this instead of listing fields by hand: a hand-written list that
 * forgets a column does not fail to compile, it silently makes that counter's
 * monthly delta zero — which is how a scoring stat would quietly stop counting.
 */
export const STAT_TOTALS_SELECT = Object.fromEntries(STAT_KEYS.map((key) => [key, true])) as Record<
  keyof StatTotals,
  true
>;

/** Copies just the counters out of a wider row (a snapshot, a query result). */
export function pickTotals(row: StatTotals | null | undefined): StatTotals {
  if (!row) return emptyTotals();
  const out = emptyTotals();
  for (const key of STAT_KEYS) out[key] = row[key];
  return out;
}

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
    objectivesDefended: 0,
    objectivesDestroyed: 0,
    objectivesArmed: 0,
    objectivesDisarmed: 0,
    sectorsDefended: 0,
    objectiveTimeSeconds: 0,
    spots: 0,
    healthRestored: 0,
    repairs: 0,
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

/**
 * Counter-by-counter difference. Exported since 2026-07-28 because the career
 * accumulator (accrueCareerPoints in ./points.ts) needs the same subtraction the
 * monthly delta uses — two implementations would be two chances to forget a
 * counter, which STAT_KEYS exists to prevent.
 */
export function subtractTotals(a: StatTotals, b: StatTotals): StatTotals {
  const out = emptyTotals();
  for (const key of STAT_KEYS) out[key] = a[key] - b[key];
  return out;
}

/**
 * Activity within the reference month: last snapshot of the month minus the
 * first, **counting only the account the member currently plays on**. Fewer than
 * two comparable snapshots → all zeros.
 *
 * The account filter is the load-bearing part. These counters are lifetime totals
 * of one EA account, so subtracting across a rebind subtracts one person's career
 * from another's. On 2026-07-28 that produced 86.914 points for a member whose
 * only real activity that month was 301 minutes: his first snapshot came from a
 * stranger's account he had been bound to by mistake, the second from his own.
 *
 * "The account the member currently plays on" is taken as the newest snapshot's,
 * not the member's column, so this stays a pure function over the rows it is
 * given. The two agree in practice — a rebind is followed by a collection — and
 * where they disagree the newest row is the better answer anyway, because it is
 * the one whose totals the next cycle will extend.
 */
export function deltaForMonth(snapshots: SnapshotLike[], reference: Date): StatTotals {
  const inMonth = snapshots
    .filter((s) => isSameMonth(s.capturedAt, reference))
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  if (inMonth.length < 2) return emptyTotals();

  const current = inMonth[inMonth.length - 1];
  // A null id means "written before the column existed", which the backfill
  // assigned to the member's own account — so null and the current account are
  // the same thing, and must compare as equal.
  const sameAccount = inMonth.filter(
    (s) => (s.eaNucleusId ?? null) === (current.eaNucleusId ?? null),
  );
  if (sameAccount.length < 2) return emptyTotals();
  return subtractTotals(current, sameAccount[0]);
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

/**
 * Sort by value, highest first, and number the rows 1..N so **every position is
 * unique** — unlike `withCompetitionRanks`, ties do not share a number.
 *
 * The monthly board needs this. It has one row per member and a long tail sitting
 * on zero points, and competition ranks put that whole tail on the same number:
 * with 8 members scoring, the other 90 all read "9", which looks like a bug
 * rather than like a tie. Sequential numbering makes the list countable.
 *
 * Ordering within equal values is decided by `tieBreak`, so the sequence is
 * stable between renders instead of depending on how the rows arrived.
 */
export function withOrdinalRanks<T>(
  items: T[],
  valueOf: (item: T) => number,
  tieBreak?: (a: T, b: T) => number,
): Ranked<T>[] {
  const scored = items.map((item) => ({ ...item, value: valueOf(item) }));
  scored.sort((a, b) => b.value - a.value || (tieBreak ? tieBreak(a, b) : 0));
  return scored.map((item, index) => ({ ...item, rank: index + 1 }));
}

/** Rank members by one of the predefined metrics, highest first. */
export function rankMembers<T extends RankableMember>(
  members: T[],
  metric: RankMetric,
): Ranked<T>[] {
  return withCompetitionRanks(members, (m) => metricValue(m, metric));
}
