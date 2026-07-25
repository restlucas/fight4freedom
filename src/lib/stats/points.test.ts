import { describe, expect, it } from "vitest";

import { computePoints, POINT_WEIGHTS } from "./points";
import { emptyTotals, type StatTotals } from "./snapshots";

function progress(partial: Partial<StatTotals>): StatTotals {
  return { ...emptyTotals(), ...partial };
}

describe("computePoints", () => {
  it("scores zero progress as zero", () => {
    expect(computePoints(emptyTotals())).toBe(0);
  });

  it("weighs each counter", () => {
    expect(computePoints(progress({ kills: 10 }))).toBe(10 * POINT_WEIGHTS.kills);
    expect(computePoints(progress({ wins: 2 }))).toBe(2 * POINT_WEIGHTS.wins);
  });

  it("sums the weighted counters", () => {
    // 10 kills (30) + 2 wins (30) + 5 revives (20) - 4 deaths (4) = 76
    expect(
      computePoints(progress({ kills: 10, wins: 2, revives: 5, deaths: 4 })),
    ).toBe(76);
  });

  it("ignores counters that carry no weight", () => {
    expect(computePoints(progress({ timePlayedMinutes: 600, losses: 9 }))).toBe(0);
  });

  it("never goes negative", () => {
    expect(computePoints(progress({ deaths: 50 }))).toBe(0);
  });
});
