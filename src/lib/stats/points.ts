// Monthly ranking score. Points come from a member's PROGRESS during the month
// (the snapshot delta), never from lifetime totals, so a veteran does not sit at
// the top forever.
//
// SCORING PRINCIPLE (decided with the clan owner, 2026-07-27): teamwork outranks
// combat. Holding, capturing and defending objectives, reviving and assisting
// teammates are worth far more per action than killing.
//
// WHY THESE NUMBERS, AND WHY NOT ROUNDER ONES
//
// Weight alone does not set priority — weight TIMES frequency does, and the
// frequencies are wildly different. Measured on the two real members (career
// totals from the gm_all bucket, over 512 and 47 matches):
//
//   kills                34.35 and 13.30 per match
//   killAssists          11.88 and 10.38
//   revives               6.74 and  4.66
//   spots                 5.04 and  2.28
//   objectivesDefended    4.85 and  3.17
//   objectivesCaptured    2.25 and  1.81
//   sectorsDefended        0.12 and  0.06
//   objectivesArmed        0.05 and  0.19
//   objectivesDestroyed    0.03 and  0.13
//   objectivesDisarmed     0.02 and  0.11
//
// So a kill at weight 3 against an objective destroyed at weight 50 still hands
// combat 103 points per match versus 1.35 — the opposite of the intent. The
// weights below were fitted against those real numbers to land teamwork at
// 73.3% and 75.4% of each member's score, with combat at 12.8% and 6.3%.
//
// Consequence for maintenance: changing a weight without re-checking the share
// it produces is guesswork. The shares, not the weights, are the contract, which
// is what points.test.ts asserts.
//
// TWO DELIBERATE EXCLUSIONS
//
//   `repairs` — Engineer-locked. One member has 6,756 career repairs, the other
//   exactly 0 because they never play the class. Scoring it would tax every
//   member who plays anything else. Still collected, because history cannot be
//   backfilled if the clan changes its mind.
//
//   `deaths` — no longer a penalty. Playing the objective means dying more, so
//   punishing deaths would work against the whole point of this scheme.
//
// A NOTE ON CLASS FAIRNESS
//
// The objective counters are class-agnostic and carry the scheme: captures per
// match land at 2.25 vs 1.81 and objective time at 205 s vs 213 s across two
// very different players. The support counters are the biased half, so no single
// class-locked stat may dominate. `spots` was checked before being included: one
// member has 2,581 spots with only 4.8% of their class time on Recon, which
// would mean 7.76 spots per minute of Recon play — so spotting counts for every
// class, not just Recon.

import type { StatTotals } from "./snapshots";

export const POINT_WEIGHTS: Record<keyof StatTotals, number> = {
  // --- objectives: the team advances on the map (~38% of the score) ---
  objectivesCaptured: 6,
  objectivesDefended: 3,
  /** Per SECOND on the objective. Tiny by necessity: ~205 s per match. */
  objectiveTimeSeconds: 0.02,
  sectorsDefended: 15,
  // Rare tactical plays, roughly one every 8 to 40 matches. Held at 12-15
  // rather than the 25-40 that career averages suggested, because the ranking
  // scores a single month: at those weights one lucky armed MCOM swung 6% of a
  // member's monthly total, which is volatility, not merit.
  objectivesArmed: 12,
  objectivesDisarmed: 12,
  objectivesDestroyed: 15,

  // --- squad support (~35%) ---
  revives: 3,
  assists: 0.8,
  spots: 0.5,
  /** Per hit point restored, so ~64 HP per match lands near 1% of the score. */
  healthRestored: 0.02,

  // --- combat: seasoning, not the engine (~13%) ---
  kills: 0.3,
  headshots: 0.3,

  // --- outcome (~14%) ---
  wins: 25,

  // --- not scored (kept at 0 so the Record stays exhaustive) ---
  /** Losing is not a fault worth points; `wins` already rewards the outcome. */
  losses: 0,
  /** See "TWO DELIBERATE EXCLUSIONS" above. */
  deaths: 0,
  repairs: 0,
  /** Time played is the denominator of everything else, never a score itself. */
  timePlayedMinutes: 0,
};

/**
 * Weights worth showing to members, in display order: heaviest first, so the
 * footer on /ranking reads as the scheme's intent instead of a dump of the
 * object above. Only scored stats belong here.
 */
export const SCORED_STATS: { key: keyof StatTotals; label: string }[] = [
  { key: "wins", label: "vitória" },
  { key: "sectorsDefended", label: "setor defendido" },
  { key: "objectivesDestroyed", label: "objetivo destruído" },
  { key: "objectivesArmed", label: "objetivo armado" },
  { key: "objectivesDisarmed", label: "objetivo neutralizado" },
  { key: "objectivesCaptured", label: "objetivo conquistado" },
  { key: "objectivesDefended", label: "objetivo defendido" },
  { key: "revives", label: "revive" },
  { key: "assists", label: "assist" },
  { key: "spots", label: "inimigo marcado" },
  { key: "kills", label: "kill" },
  { key: "headshots", label: "headshot" },
];

/**
 * Stats that make up the teamwork half of the score, for the share assertions
 * in points.test.ts and for anything that wants to explain a member's board
 * position ("83% dos seus pontos vieram de jogo em equipe").
 */
export const TEAMWORK_STATS: (keyof StatTotals)[] = [
  "objectivesCaptured",
  "objectivesDefended",
  "objectiveTimeSeconds",
  "sectorsDefended",
  "objectivesArmed",
  "objectivesDisarmed",
  "objectivesDestroyed",
  "revives",
  "assists",
  "spots",
  "healthRestored",
];

/** Score for one month of progress. Never negative. */
export function computePoints(progress: StatTotals): number {
  let total = 0;
  for (const key of Object.keys(POINT_WEIGHTS) as (keyof StatTotals)[]) {
    total += progress[key] * POINT_WEIGHTS[key];
  }
  return Math.max(0, Math.round(total));
}

/**
 * Share of a score that came from teamwork, as a 0..1 fraction. Zero-point
 * months return 0 rather than NaN.
 */
export function teamworkShare(progress: StatTotals): number {
  let team = 0;
  let all = 0;
  for (const key of Object.keys(POINT_WEIGHTS) as (keyof StatTotals)[]) {
    const points = progress[key] * POINT_WEIGHTS[key];
    all += points;
    if (TEAMWORK_STATS.includes(key)) team += points;
  }
  if (all <= 0) return 0;
  return team / all;
}
