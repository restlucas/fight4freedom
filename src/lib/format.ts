// Display primitives shared by more than one feature.
//
// These two started inside src/features/clan/lib/format.ts and moved here when
// the identity screen needed them as well: CLAUDE.md forbids a feature importing
// from another feature, and a pt-BR number format and the label of a Prisma enum
// are exactly the "generic code stays shared" case. The clan module re-exports
// them, so its own callers were untouched.

import type { PlayerClass } from "@prisma/client";

const numberFormatter = new Intl.NumberFormat("pt-BR");

/** Thousands separators, pt-BR: 13695 -> "13.695". */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

const compactFormatter = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Short form for numbers too long to read in a small tile: 10308364 -> "10,3 mi".
 *
 * Exists for account XP, which runs to eight digits — "10.308.364" is 10 characters
 * of monospaced digits and overflows a stat tile that fits about 8. Only for
 * magnitudes nobody compares digit by digit; anything a member might check against
 * the game must stay exact via `formatNumber`.
 */
export function formatCompactNumber(value: number): string {
  return compactFormatter.format(value);
}

export const CLASS_LABEL: Record<PlayerClass, string> = {
  assault: "Assalto",
  engineer: "Engenheiro",
  support: "Suporte",
  recon: "Recon",
};
