// The four stats members can be sorted and crowned by. Kept in one place so the
// sort controls on /membros, the crowns on the cards and the profile page can
// never drift apart.

import { computeKd, hoursPlayed, totalMatches, type StatTotals } from "@/lib/stats/snapshots";

export type StatKey = "kd" | "kills" | "matches" | "hours";

export const STAT_KEYS: StatKey[] = ["kd", "kills", "matches", "hours"];

export const STAT_KEY_LABEL: Record<StatKey, string> = {
  kd: "K/D",
  kills: "Kills",
  matches: "Partidas",
  hours: "Horas",
};

export type SortDirection = "asc" | "desc";

export function statValue(totals: StatTotals, key: StatKey): number {
  switch (key) {
    case "kd":
      return computeKd(totals.kills, totals.deaths);
    case "kills":
      return totals.kills;
    case "matches":
      return totalMatches(totals);
    case "hours":
      return hoursPlayed(totals.timePlayedMinutes);
  }
}

/** Member ids leading each stat. A stat nobody scored in has no leader. */
export type StatLeaders = Record<StatKey, string[]>;

export function emptyStatLeaders(): StatLeaders {
  return { kd: [], kills: [], matches: [], hours: [] };
}

/**
 * The top member for each stat. Ties are all crowned, and a stat where every
 * member sits at zero has no leader at all.
 */
export function findStatLeaders(members: { id: string; totals: StatTotals }[]): StatLeaders {
  const leaders = emptyStatLeaders();

  for (const key of STAT_KEYS) {
    let best = 0;
    for (const member of members) {
      const value = statValue(member.totals, key);
      if (value > best) best = value;
    }
    if (best <= 0) continue;
    leaders[key] = members
      .filter((member) => statValue(member.totals, key) === best)
      .map((member) => member.id);
  }

  return leaders;
}

export function isStatLeader(
  leaders: StatLeaders | undefined,
  key: StatKey,
  memberId: string,
): boolean {
  return leaders?.[key].includes(memberId) ?? false;
}

/** Sorts members by a stat without mutating the input. */
export function sortByStat<T extends { totals: StatTotals }>(
  members: T[],
  key: StatKey,
  direction: SortDirection,
): T[] {
  const factor = direction === "desc" ? -1 : 1;
  return [...members].sort(
    (a, b) => (statValue(a.totals, key) - statValue(b.totals, key)) * factor,
  );
}
