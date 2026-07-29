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

export const CLASS_LABEL: Record<PlayerClass, string> = {
  assault: "Assalto",
  engineer: "Engenheiro",
  support: "Suporte",
  recon: "Recon",
};
