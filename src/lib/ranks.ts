// Rank ladder, following the Brazilian Army hierarchy (Lei 6.880/80) from the
// bottom up — every entry is a real posto or graduação, starting at Soldado and
// topping out at Marechal. See eb.mil.br/o-exercito/postos-e-graduacoes.
//
// Thresholds are CUMULATIVE career points, fed by the collector: every snapshot
// adds the points of the progress since the previous one (see accrueCareerPoints
// in src/lib/stats/points.ts). Everyone starts as Soldado at zero.
//
// CALIBRATED 2026-07-28, and the unit that makes it auditable is HOURS PLAYED.
// Measured over the 66,8 h the roster really played on 27-28/07 (9.957 points
// across 24 members): 149 points per hour. The career medians agree at 156. The
// design uses 150, so every threshold below is `hours x 150` rounded to a human
// number, and the comment on each line is the hours it stands for.
//
// The previous ladder topped out at 20.000 and was written as provisional. At the
// measured rate that is 133 hours: the heaviest player in the roster (11 h across
// the two collected days) would have finished the entire ladder in 24 days, and a
// 50 h/month member in 2,7 months. It was not difficulty, it was a formality.
//
// The shape this one aims for, checked against the tiers in the study:
//   - first promotion in HOURS, not weeks — Cabo at 5 h keeps a new member moving;
//   - after two months the roster spreads from Terceiro-Sargento (8 h/month) to
//     Capitao (the measured outlier's 165 h/month), nobody near the top;
//   - Marechal at 1.600 h is beyond ANY current career in the roster — the
//     longest is 814 h, worth General de Brigada. It is a multi-year goal:
//     16 months at 100 h/month, 2,7 years at 50 h/month, unreachable casually.
//
// COUPLED TO POINT_WEIGHTS. The thresholds are points, so if the weights are
// retuned (backlog item 3 in docs/plano.md), the points-per-hour changes and every
// threshold here has to be rescaled by the SAME factor. Skipping that silently
// changes how hard promotion is without anyone touching this file.
//
// Insignia artwork lives in public/patentes/<slug>.webp — one file per slug
// below. The files there now are placeholders (a shield with the rank
// abbreviation), meant to be overwritten by the real art under the same names.

export type Rank = {
  /** Position in the ladder, 1-based. */
  level: number;
  slug: string;
  name: string;
  /** Cumulative points needed to hold this rank. */
  threshold: number;
};

export const RANKS: Rank[] = [
  { level: 1, slug: "soldado", name: "Soldado", threshold: 0 }, //          0 h
  { level: 2, slug: "cabo", name: "Cabo", threshold: 750 }, //              5 h
  { level: 3, slug: "terceiro-sargento", name: "Terceiro-Sargento", threshold: 2_000 }, //   13 h
  { level: 4, slug: "segundo-sargento", name: "Segundo-Sargento", threshold: 4_500 }, //     30 h
  { level: 5, slug: "primeiro-sargento", name: "Primeiro-Sargento", threshold: 8_000 }, //   53 h
  { level: 6, slug: "subtenente", name: "Subtenente", threshold: 13_000 }, //          87 h
  { level: 7, slug: "segundo-tenente", name: "Segundo-Tenente", threshold: 20_000 }, //     133 h
  { level: 8, slug: "primeiro-tenente", name: "Primeiro-Tenente", threshold: 30_000 }, //   200 h
  { level: 9, slug: "capitao", name: "Capitão", threshold: 42_000 }, //                280 h
  { level: 10, slug: "major", name: "Major", threshold: 55_000 }, //                   367 h
  { level: 11, slug: "tenente-coronel", name: "Tenente-Coronel", threshold: 75_000 }, //    500 h
  { level: 12, slug: "coronel", name: "Coronel", threshold: 100_000 }, //              667 h
  { level: 13, slug: "general-de-brigada", name: "General de Brigada", threshold: 125_000 }, // 833 h
  { level: 14, slug: "general-de-divisao", name: "General de Divisão", threshold: 155_000 }, // 1.033 h
  { level: 15, slug: "general-de-exercito", name: "General de Exército", threshold: 190_000 }, // 1.267 h
  { level: 16, slug: "marechal", name: "Marechal", threshold: 240_000 }, //          1.600 h
];

/**
 * Points per hour the ladder above was calibrated with, kept as a named constant
 * because it is the only number that makes the thresholds checkable: divide any
 * threshold by this and you get the hours of play it stands for.
 *
 * Measured, not assumed — see the file header.
 */
export const POINTS_PER_HOUR = 150;

/** Hours of play a threshold stands for, at the calibrated rate. */
export function hoursForPoints(points: number): number {
  return points / POINTS_PER_HOUR;
}

export const FIRST_RANK = RANKS[0];
export const TOP_RANK = RANKS[RANKS.length - 1];

/** Path to the insignia artwork for a rank. */
export function insigniaPath(rank: Rank): string {
  return `/patentes/${rank.slug}.webp`;
}

/**
 * The rank a slug names, or null. Used by the activity feed, which stores the slug
 * on the event row rather than the name: the slug is stable, addresses the artwork
 * and survives a rename of the label.
 */
export function rankBySlug(slug: string): Rank | null {
  return RANKS.find((rank) => rank.slug === slug) ?? null;
}

export type RankProgress = {
  rank: Rank;
  /** Null once the top rank is reached. */
  next: Rank | null;
  /** Points earned inside the current rank. */
  pointsIntoRank: number;
  /** Points the current rank spans. Zero at the top. */
  rankSpan: number;
  /** Points still missing for the next rank. Zero at the top. */
  pointsToNext: number;
  /** 0..1 progress towards the next rank. Always 1 at the top. */
  fraction: number;
};

/** The highest rank whose threshold the points reach. Never null. */
export function rankForPoints(points: number): Rank {
  // Points come from the database, so guard against null/undefined/NaN leaking
  // into the ladder and producing a NaN progress bar.
  const safe = Number.isFinite(points) ? Math.max(0, points) : 0;
  let current = FIRST_RANK;
  for (const rank of RANKS) {
    if (safe >= rank.threshold) current = rank;
    else break;
  }
  return current;
}

/** Current rank plus everything needed to draw a progress bar. */
export function rankProgress(points: number): RankProgress {
  // Points come from the database, so guard against null/undefined/NaN leaking
  // into the ladder and producing a NaN progress bar.
  const safe = Number.isFinite(points) ? Math.max(0, points) : 0;
  const rank = rankForPoints(safe);
  const next = RANKS[rank.level] ?? null;

  if (!next) {
    return {
      rank,
      next: null,
      pointsIntoRank: safe - rank.threshold,
      rankSpan: 0,
      pointsToNext: 0,
      fraction: 1,
    };
  }

  const rankSpan = next.threshold - rank.threshold;
  const pointsIntoRank = safe - rank.threshold;
  return {
    rank,
    next,
    pointsIntoRank,
    rankSpan,
    pointsToNext: next.threshold - safe,
    fraction: Math.min(1, Math.max(0, pointsIntoRank / rankSpan)),
  };
}
