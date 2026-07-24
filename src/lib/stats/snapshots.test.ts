import { describe, expect, it } from "vitest";

import {
  computeKd,
  computeWinRate,
  deltaForMonth,
  hoursPlayed,
  killsPerMatch,
  latestSnapshot,
  rankMembers,
  totalMatches,
  type RankableMember,
  type SnapshotLike,
  type StatTotals,
} from "./snapshots";

function totals(partial: Partial<StatTotals>): StatTotals {
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
    ...partial,
  };
}

function snapshot(capturedAt: string, partial: Partial<StatTotals>): SnapshotLike {
  return { capturedAt: new Date(capturedAt), ...totals(partial) };
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
