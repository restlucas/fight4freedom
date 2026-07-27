import { describe, expect, it } from "vitest";

import {
  computePoints,
  POINT_WEIGHTS,
  SCORED_STATS,
  TEAMWORK_STATS,
  teamworkShare,
} from "./points";
import { emptyTotals, type StatTotals } from "./snapshots";

function progress(partial: Partial<StatTotals>): StatTotals {
  return { ...emptyTotals(), ...partial };
}

/**
 * Real career totals for the two clan members, read through `toRawStats` against
 * the live API on 2026-07-27, AFTER the bucket change (kills without bots, and
 * assists/revives from the class bucket). These are the only honest input for the
 * share assertions below — invented numbers would let a bad weight pass.
 *
 * They will drift as the two keep playing, and that is fine: the assertions check
 * PROPORTIONS, not absolute totals, so the snapshot only needs to be
 * representative. Refresh them if the shares ever start looking implausible.
 */
const MELANSIA: StatTotals = {
  kills: 12_320,
  deaths: 4_126,
  wins: 268,
  losses: 244,
  assists: 4_365,
  revives: 3_062,
  headshots: 2_874,
  objectivesCaptured: 1_152,
  timePlayedMinutes: 12_431,
  objectivesDefended: 2_483,
  objectivesDestroyed: 14,
  objectivesArmed: 25,
  objectivesDisarmed: 9,
  sectorsDefended: 63,
  objectiveTimeSeconds: 105_152,
  spots: 2_581,
  healthRestored: 33_015,
  repairs: 6_756,
};

/** Second real member: 47 matches, never plays Engineer (repairs = 0). */
const XUVEROO: StatTotals = {
  kills: 589,
  deaths: 391,
  wins: 25,
  losses: 22,
  assists: 448,
  revives: 219,
  headshots: 88,
  objectivesCaptured: 85,
  timePlayedMinutes: 1_281,
  objectivesDefended: 149,
  objectivesDestroyed: 6,
  objectivesArmed: 9,
  objectivesDisarmed: 5,
  sectorsDefended: 3,
  objectiveTimeSeconds: 9_995,
  spots: 107,
  healthRestored: 691,
  repairs: 0,
};

describe("computePoints", () => {
  it("scores zero progress as zero", () => {
    expect(computePoints(emptyTotals())).toBe(0);
  });

  it("weighs each counter", () => {
    expect(computePoints(progress({ revives: 10 }))).toBe(10 * POINT_WEIGHTS.revives);
    expect(computePoints(progress({ wins: 2 }))).toBe(2 * POINT_WEIGHTS.wins);
  });

  it("sums the weighted counters", () => {
    // 2 wins (50) + 5 revives (15) + 3 captures (18) + 10 kills (3) = 86
    expect(computePoints(progress({ wins: 2, revives: 5, objectivesCaptured: 3, kills: 10 }))).toBe(
      86,
    );
  });

  it("ignores counters that carry no weight", () => {
    expect(computePoints(progress({ timePlayedMinutes: 600, losses: 9, repairs: 400 }))).toBe(0);
  });

  it("does not penalise deaths", () => {
    // Playing the objective means dying more; the scheme must not punish it.
    expect(computePoints(progress({ deaths: 50 }))).toBe(0);
    expect(computePoints(progress({ revives: 10, deaths: 50 }))).toBe(
      computePoints(progress({ revives: 10 })),
    );
  });

  it("never goes negative", () => {
    expect(computePoints(emptyTotals())).toBeGreaterThanOrEqual(0);
  });
});

describe("teamwork priority (the actual contract)", () => {
  // The weights are only meaningful through the shares they produce, because
  // frequency varies by three orders of magnitude between these counters.
  // Measured on 2026-07-27: 74.4% and 75.4% teamwork, 10.4% and 6.0% combat.
  it("gives teamwork at least 70% of a real member's score", () => {
    expect(teamworkShare(MELANSIA)).toBeGreaterThan(0.7);
    expect(teamworkShare(XUVEROO)).toBeGreaterThan(0.7);
  });

  it("keeps combat under 15% for both real members", () => {
    for (const member of [MELANSIA, XUVEROO]) {
      const total = computePoints(member);
      const combat =
        member.kills * POINT_WEIGHTS.kills + member.headshots * POINT_WEIGHTS.headshots;
      expect(combat / total).toBeLessThan(0.15);
    }
  });

  it("ranks a support player above a pure fragger with the same playtime", () => {
    // Same 40 matches: one farms kills, the other plays the objective.
    const fragger = progress({ kills: 900, headshots: 200, wins: 20, deaths: 300 });
    const support = progress({
      kills: 200,
      wins: 20,
      revives: 260,
      assists: 420,
      objectivesCaptured: 90,
      objectivesDefended: 190,
      objectiveTimeSeconds: 8_200,
      spots: 200,
      deaths: 380,
    });
    expect(computePoints(support)).toBeGreaterThan(computePoints(fragger));
  });

  it("does not reward the Engineer-locked stat", () => {
    // xuveroo has 0 repairs and must not be disadvantaged by that alone.
    expect(computePoints(progress({ repairs: 6_756 }))).toBe(0);
  });

  it("keeps rare tactical plays from dominating a single month", () => {
    // One lucky month of MCOM work must not outweigh consistent objective play.
    const lucky = progress({ objectivesArmed: 4, objectivesDestroyed: 3 });
    const consistent = progress({
      objectivesCaptured: 40,
      objectivesDefended: 80,
      revives: 60,
    });
    expect(computePoints(consistent)).toBeGreaterThan(computePoints(lucky) * 3);
  });
});

describe("weight bookkeeping", () => {
  it("exposes a weight for every stat, so a new counter cannot be forgotten", () => {
    for (const key of Object.keys(emptyTotals()) as (keyof StatTotals)[]) {
      expect(POINT_WEIGHTS[key]).toBeDefined();
    }
  });

  it("only advertises stats that actually score", () => {
    for (const { key } of SCORED_STATS) {
      expect(POINT_WEIGHTS[key]).not.toBe(0);
    }
  });

  it("counts every teamwork stat as one that scores", () => {
    for (const key of TEAMWORK_STATS) {
      expect(POINT_WEIGHTS[key]).toBeGreaterThan(0);
    }
  });
});
