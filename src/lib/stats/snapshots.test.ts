import { describe, expect, it } from "vitest";

import {
  allModeKillsOf,
  computeKd,
  computeWinRate,
  deltaForMonth,
  emptyTotals,
  withOrdinalRanks,
  hasNewActivity,
  headshotRate,
  hoursPlayed,
  killsPerMatch,
  latestSnapshot,
  rankMembers,
  totalMatches,
  type ActivityCounters,
  type RankableMember,
  type SnapshotLike,
  type StatTotals,
} from "./snapshots";

function totals(partial: Partial<StatTotals>): StatTotals {
  return { ...emptyTotals(), ...partial };
}

function snapshot(
  capturedAt: string,
  partial: Partial<StatTotals>,
  eaNucleusId: string | null = null,
): SnapshotLike {
  return { capturedAt: new Date(capturedAt), eaNucleusId, ...totals(partial) };
}

describe("computeKd", () => {
  it("divides kills by deaths", () => {
    expect(computeKd(10, 5)).toBe(2);
  });

  it("returns the kill count when there are no deaths", () => {
    expect(computeKd(7, 0)).toBe(7);
    expect(computeKd(0, 0)).toBe(0);
  });
});

describe("totalMatches / computeWinRate / killsPerMatch", () => {
  it("derives matches from wins + losses", () => {
    expect(totalMatches(totals({ wins: 12, losses: 8 }))).toBe(20);
  });

  it("computes win rate over total matches", () => {
    expect(computeWinRate(3, 1)).toBe(0.75);
    expect(computeWinRate(0, 0)).toBe(0);
  });

  it("computes kills per match", () => {
    expect(killsPerMatch(totals({ kills: 200, wins: 12, losses: 8 }))).toBe(10);
    expect(killsPerMatch(totals({ kills: 5 }))).toBe(0);
  });
});

describe("hoursPlayed", () => {
  it("converts minutes to hours", () => {
    expect(hoursPlayed(120)).toBe(2);
  });
});

describe("headshotRate", () => {
  it("divides by the ALL-MODE kills, not by the bot-free column", () => {
    // The real case that exposed this: 7.179 human kills and 7.720 headshots on an
    // account with 65.533 all-mode kills. Against `kills` the rate would be 107 %;
    // against the right denominator it is 11,8 %.
    expect(headshotRate(7_720, 65_533)).toBeCloseTo(0.1178, 4);
  });

  it("can never exceed 100 %", () => {
    expect(headshotRate(200, 100)).toBe(1);
  });

  it("returns null when the all-mode total is missing or zero", () => {
    // Snapshots written before `allModeKills` was recorded cannot produce a rate.
    // Null tells the caller to show the absolute count instead of a wrong percent.
    expect(headshotRate(50, null)).toBeNull();
    expect(headshotRate(50, 0)).toBeNull();
  });
});

describe("allModeKillsOf", () => {
  it("reads the key out of the extra column", () => {
    expect(allModeKillsOf({ allModeKills: 65_533 })).toBe(65_533);
  });

  it("narrows every shape the JSON column can legally hold", () => {
    // Prisma types this as JsonValue, so null, scalars and arrays all reach here.
    expect(allModeKillsOf(null)).toBeNull();
    expect(allModeKillsOf(undefined)).toBeNull();
    expect(allModeKillsOf(42)).toBeNull();
    expect(allModeKillsOf("65533")).toBeNull();
    expect(allModeKillsOf([65_533])).toBeNull();
    expect(allModeKillsOf({})).toBeNull();
    expect(allModeKillsOf({ allModeKills: "65533" })).toBeNull();
    expect(allModeKillsOf({ allModeKills: NaN })).toBeNull();
  });
});

describe("latestSnapshot", () => {
  it("returns the most recent snapshot", () => {
    const a = snapshot("2026-07-01T00:00:00Z", { kills: 1 });
    const b = snapshot("2026-07-20T00:00:00Z", { kills: 5 });
    expect(latestSnapshot([a, b])?.kills).toBe(5);
    expect(latestSnapshot([b, a])?.kills).toBe(5);
  });

  it("returns null when empty", () => {
    expect(latestSnapshot([])).toBeNull();
  });
});

describe("deltaForMonth", () => {
  const july = new Date("2026-07-15T00:00:00Z");

  it("subtracts the first in-month snapshot from the last", () => {
    const snaps = [
      snapshot("2026-06-30T00:00:00Z", { kills: 100, wins: 10 }),
      snapshot("2026-07-02T00:00:00Z", { kills: 120, wins: 12 }),
      snapshot("2026-07-28T00:00:00Z", { kills: 200, wins: 20 }),
    ];
    const delta = deltaForMonth(snaps, july);
    expect(delta.kills).toBe(80);
    expect(delta.wins).toBe(8);
  });

  it("returns zeros when the month has fewer than two snapshots", () => {
    const snaps = [snapshot("2026-07-02T00:00:00Z", { kills: 120 })];
    expect(deltaForMonth(snaps, july).kills).toBe(0);
  });

  it("never subtracts across a rebind: only the current account counts", () => {
    // Willam, 2026-07-28. The first row is a stranger's account he had been bound
    // to by mistake; the second is his own. Subtracting them scored 86.914 points
    // for a member who had played 301 minutes that month.
    const snaps = [
      snapshot("2026-07-27T22:50:00Z", { kills: 76, wins: 4 }, "1004937803320"),
      snapshot("2026-07-28T05:14:00Z", { kills: 8989, wins: 659 }, "1000331359268"),
    ];
    const delta = deltaForMonth(snaps, july);
    expect(delta.kills).toBe(0);
    expect(delta.wins).toBe(0);
  });

  it("scores normally once two readings of the SAME account exist", () => {
    const snaps = [
      snapshot("2026-07-27T22:50:00Z", { kills: 76 }, "conta-antiga"),
      snapshot("2026-07-28T05:14:00Z", { kills: 8989, wins: 659 }, "conta-real"),
      snapshot("2026-07-30T05:14:00Z", { kills: 9100, wins: 670 }, "conta-real"),
    ];
    const delta = deltaForMonth(snaps, july);
    expect(delta.kills).toBe(111);
    expect(delta.wins).toBe(11);
  });

  it("treats rows predating the column as belonging to the current account", () => {
    // The backfill assigned null rows to the member's own account, so a null and
    // the current id must compare as equal or every pre-column month goes to zero.
    const snaps = [
      snapshot("2026-07-02T00:00:00Z", { kills: 100 }),
      snapshot("2026-07-28T00:00:00Z", { kills: 180 }),
    ];
    expect(deltaForMonth(snaps, july).kills).toBe(80);
  });

  it("ignores snapshots from other months", () => {
    const snaps = [
      snapshot("2026-06-01T00:00:00Z", { kills: 10 }),
      snapshot("2026-06-20T00:00:00Z", { kills: 50 }),
      snapshot("2026-07-05T00:00:00Z", { kills: 60 }),
    ];
    expect(deltaForMonth(snaps, july).kills).toBe(0);
  });
});

describe("rankMembers", () => {
  const members: RankableMember[] = [
    { memberId: "a", totals: totals({ kills: 100, wins: 10 }), medalCount: 1 },
    { memberId: "b", totals: totals({ kills: 300, wins: 5 }), medalCount: 3 },
    { memberId: "c", totals: totals({ kills: 300, wins: 8 }), medalCount: 2 },
  ];

  it("orders by matches (wins + losses), highest first", () => {
    // matches: a=10, c=8, b=5
    const ranked = rankMembers(members, "matches");
    expect(ranked.map((m) => m.memberId)).toEqual(["a", "c", "b"]);
    expect(ranked.map((m) => m.value)).toEqual([10, 8, 5]);
  });

  it("orders by kills with competition ranking for ties", () => {
    const ranked = rankMembers(members, "kills");
    const ranks = Object.fromEntries(ranked.map((m) => [m.memberId, m.rank]));
    expect(ranks.b).toBe(1);
    expect(ranks.c).toBe(1);
    expect(ranks.a).toBe(3);
  });

  it("does not mutate the input", () => {
    const before = members.map((m) => m.memberId);
    rankMembers(members, "medals");
    expect(members.map((m) => m.memberId)).toEqual(before);
  });
});

describe("hasNewActivity", () => {
  const latest: ActivityCounters = {
    kills: 17_587,
    deaths: 4_955,
    wins: 268,
    losses: 244,
    timePlayedMinutes: 12_431,
  };

  it("always writes the first snapshot", () => {
    expect(hasNewActivity(null, latest)).toBe(true);
  });

  it("skips when nothing moved", () => {
    expect(hasNewActivity(latest, { ...latest })).toBe(false);
  });

  it("writes when any counter moved", () => {
    expect(hasNewActivity(latest, { ...latest, kills: 17_600 })).toBe(true);
    expect(hasNewActivity(latest, { ...latest, losses: 245 })).toBe(true);
    expect(hasNewActivity(latest, { ...latest, timePlayedMinutes: 12_440 })).toBe(true);
  });
});

describe("withOrdinalRanks", () => {
  const board = [
    { nick: "Zeta", points: 0 },
    { nick: "Alfa", points: 0 },
    { nick: "Bravo", points: 500 },
    { nick: "Charlie", points: 0 },
    { nick: "Delta", points: 900 },
  ];
  const byNick = (a: { nick: string }, b: { nick: string }) =>
    a.nick.localeCompare(b.nick, "pt-BR");

  it("gives every row its own number, even on a tie", () => {
    const ranked = withOrdinalRanks(board, (m) => m.points, byNick);
    expect(ranked.map((m) => m.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it("orders by points first, then by the tie-break", () => {
    const ranked = withOrdinalRanks(board, (m) => m.points, byNick);
    // 900, 500, then the three zeros alphabetically.
    expect(ranked.map((m) => m.nick)).toEqual(["Delta", "Bravo", "Alfa", "Charlie", "Zeta"]);
  });

  it("is what the long tail of a fresh month needs", () => {
    // Eight members scoring and ninety on zero: competition ranks would print
    // "9" ninety times, which reads as a bug instead of as a tie.
    const many = [
      ...Array.from({ length: 8 }, (_, i) => ({ nick: `Top${i}`, points: 100 - i })),
      ...Array.from({ length: 90 }, (_, i) => ({
        nick: `Zero${String(i).padStart(2, "0")}`,
        points: 0,
      })),
    ];
    const ranked = withOrdinalRanks(many, (m) => m.points, byNick);
    expect(new Set(ranked.map((m) => m.rank)).size).toBe(98);
    expect(ranked[ranked.length - 1].rank).toBe(98);
  });

  it("does not mutate the input", () => {
    const input = [...board];
    withOrdinalRanks(input, (m) => m.points, byNick);
    expect(input).toEqual(board);
  });
});
