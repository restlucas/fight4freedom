// Monthly ranking score. Points come from a member's PROGRESS during the month
// (the snapshot delta), never from lifetime totals, so a veteran does not sit at
// the top forever.
//
// PROVISIONAL WEIGHTS: the real scoring rules are still to be defined with the
// clan. Everything lives in POINT_WEIGHTS — changing the balance is a one-line
// edit here, and nothing else in the app needs to know.

import type { StatTotals } from "./snapshots";

export const POINT_WEIGHTS: Record<keyof StatTotals, number> = {
  kills: 3,
  deaths: -1,
  wins: 15,
  losses: 0,
  assists: 1,
  revives: 4,
  headshots: 2,
  objectivesCaptured: 2,
  timePlayedMinutes: 0,
};

/** Weights worth showing to members, in display order. */
export const SCORED_STATS: { key: keyof StatTotals; label: string }[] = [
  { key: "wins", label: "vitória" },
  { key: "kills", label: "kill" },
  { key: "revives", label: "revive" },
  { key: "objectivesCaptured", label: "objetivo" },
  { key: "headshots", label: "headshot" },
  { key: "assists", label: "assist" },
  { key: "deaths", label: "morte" },
];

/** Score for one month of progress. Never negative. */
export function computePoints(progress: StatTotals): number {
  let total = 0;
  for (const key of Object.keys(POINT_WEIGHTS) as (keyof StatTotals)[]) {
    total += progress[key] * POINT_WEIGHTS[key];
  }
  return Math.max(0, Math.round(total));
}
