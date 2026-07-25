// Rank ladder, following the Brazilian Army hierarchy (Lei 6.880/80) from the
// bottom up — every entry is a real posto or graduação, starting at Soldado and
// topping out at Marechal. See eb.mil.br/o-exercito/postos-e-graduacoes.
//
// Thresholds are CUMULATIVE career points: everyone starts as Soldado at zero
// and the first promotion (Cabo) costs 30. They live next to POINT_WEIGHTS in
// spirit (src/lib/stats/points.ts): both are provisional and should be tuned
// together once the scoring rules are settled with the clan.
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
  { level: 1, slug: "soldado", name: "Soldado", threshold: 0 },
  { level: 2, slug: "cabo", name: "Cabo", threshold: 30 },
  { level: 3, slug: "terceiro-sargento", name: "Terceiro-Sargento", threshold: 90 },
  { level: 4, slug: "segundo-sargento", name: "Segundo-Sargento", threshold: 200 },
  { level: 5, slug: "primeiro-sargento", name: "Primeiro-Sargento", threshold: 400 },
  { level: 6, slug: "subtenente", name: "Subtenente", threshold: 700 },
  { level: 7, slug: "segundo-tenente", name: "Segundo-Tenente", threshold: 1_100 },
  { level: 8, slug: "primeiro-tenente", name: "Primeiro-Tenente", threshold: 1_700 },
  { level: 9, slug: "capitao", name: "Capitão", threshold: 2_500 },
  { level: 10, slug: "major", name: "Major", threshold: 3_600 },
  { level: 11, slug: "tenente-coronel", name: "Tenente-Coronel", threshold: 5_000 },
  { level: 12, slug: "coronel", name: "Coronel", threshold: 7_000 },
  { level: 13, slug: "general-de-brigada", name: "General de Brigada", threshold: 9_500 },
  { level: 14, slug: "general-de-divisao", name: "General de Divisão", threshold: 12_500 },
  { level: 15, slug: "general-de-exercito", name: "General de Exército", threshold: 16_000 },
  { level: 16, slug: "marechal", name: "Marechal", threshold: 20_000 },
];

export const FIRST_RANK = RANKS[0];
export const TOP_RANK = RANKS[RANKS.length - 1];

/** Path to the insignia artwork for a rank. */
export function insigniaPath(rank: Rank): string {
  return `/patentes/${rank.slug}.webp`;
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
