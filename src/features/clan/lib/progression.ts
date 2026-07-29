// The member profile's progression series: one point per snapshot, in the shape
// the chart consumes.
//
// Pure and free of Prisma so it is unit tested without a database, and so the
// cached query (queries.ts) stays a thin mapping layer.
//
// WHY POINTS ARE ACCUMULATED HERE AND NOT READ FROM `member.rankPoints`. The
// balance on the member row is a single running total — it says where they are, not
// how they got there. Reconstructing history backwards from it is not an option
// either: it carries the balance imported from the v1 site, which stands for a
// career we never watched, so subtracting measured deltas from it would run
// negative for anyone whose imported rank was low.
//
// So the series starts at zero and accumulates only what collection actually
// measured. That is a different number from the rank card on purpose, and the chart
// says so in its own words ("desde o início da coleta").

import { accrueCareerPoints } from "@/lib/stats/points";
import { computeKd, pickTotals, totalMatches, type StatTotals } from "@/lib/stats/snapshots";

/** One reading, ready to plot. */
export type ProgressionPoint = {
  /** ISO instant — the cache serializes with JSON, so never a Date. */
  capturedAt: string;
  /** Career points accumulated since the first collected reading. */
  points: number;
  kd: number;
  kills: number;
  matches: number;
  hours: number;
};

type SnapshotInput = StatTotals & {
  capturedAt: Date;
  eaNucleusId?: string | null;
};

/**
 * Builds the series from a member's snapshots, oldest first.
 *
 * Accepts them in any order and sorts, because a caller that forgets `orderBy`
 * would otherwise produce a chart that zigzags and a points total that is simply
 * wrong — the accumulation is order-dependent.
 */
export function buildProgression(snapshots: SnapshotInput[]): ProgressionPoint[] {
  const ordered = [...snapshots].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());

  let points = 0;
  return ordered.map((snapshot, index) => {
    const totals = pickTotals(snapshot);
    const previous = index === 0 ? null : ordered[index - 1];
    // Same rule the collector credits with, including its two refusals: a first
    // reading and a reading across a rebind both add nothing.
    points += accrueCareerPoints(
      previous ? { ...pickTotals(previous), eaNucleusId: previous.eaNucleusId } : null,
      { ...totals, eaNucleusId: snapshot.eaNucleusId },
    );

    return {
      capturedAt: snapshot.capturedAt.toISOString(),
      points,
      kd: computeKd(totals.kills, totals.deaths),
      kills: totals.kills,
      matches: totalMatches(totals),
      hours: totals.timePlayedMinutes / 60,
    };
  });
}
