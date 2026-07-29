// "Faltam N pontos, cerca de H horas neste ritmo" — the profile's next-rank
// forecast.
//
// Pure, because the interesting part is the arithmetic and the honesty of it, not
// the markup. Two rules shape everything below:
//
//   1. Prefer the MEMBER's own measured rate over the clan's calibration. A
//      support player who farms objectives scores differently from a fragger, and
//      telling both of them the same number makes the forecast decorative.
//   2. Say which basis was used. A forecast built on the clan average is a
//      different claim from one built on the member's last week, and a reader who
//      cannot tell them apart cannot judge either.

import { POINTS_PER_HOUR, rankProgress, type Rank } from "@/lib/ranks";

import type { ProgressionPoint } from "./progression";

/**
 * Least play time a member's own history must cover before it is used as their
 * rate. Below this the sample is one session, and one session says more about
 * which mode they played than about their pace.
 */
export const MIN_MEASURED_HOURS = 1;

export type RankForecast = {
  next: Rank;
  pointsToNext: number;
  /** Points per hour used for the estimate. */
  rate: number;
  /** Hours of play the remaining points imply at that rate. */
  hoursToNext: number;
  /**
   * Which rate this used: the member's own measured pace, or the clan-wide
   * calibration when their sample is too thin. Drives the wording.
   */
  basis: "member" | "clan";
};

/**
 * Forecast for the next rank, or null when there is nothing to forecast — the
 * member already holds the top rank.
 */
export function rankForecast(points: number, series: ProgressionPoint[]): RankForecast | null {
  const { next, pointsToNext } = rankProgress(points);
  if (!next) return null;

  const measured = measuredRate(series);
  return {
    next,
    pointsToNext,
    rate: measured ?? POINTS_PER_HOUR,
    hoursToNext: pointsToNext / (measured ?? POINTS_PER_HOUR),
    basis: measured === null ? "clan" : "member",
  };
}

/**
 * Points per hour from the member's own collected history, or null when there is
 * not enough of it.
 *
 * Both ends come from the same series, so the ratio is immune to the thing that
 * makes career averages misleading here: the totals include everything the member
 * did before collection existed, and dividing collected POINTS by career HOURS
 * would produce a rate near zero for every long-standing member.
 */
function measuredRate(series: ProgressionPoint[]): number | null {
  if (series.length < 2) return null;

  const first = series[0];
  const last = series[series.length - 1];
  const hours = last.hours - first.hours;
  const points = last.points - first.points;
  if (hours < MIN_MEASURED_HOURS || points <= 0) return null;

  return points / hours;
}
