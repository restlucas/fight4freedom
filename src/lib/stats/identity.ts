// Which field the EA search is given, for a member row.
//
// Its own module because THREE call sites must agree on it exactly — the admin
// actions, the scheduled collector and the backlog script — and if any of them
// resolved from a different field, the same member could end up bound to
// different accounts depending on which one got there first.
//
// Pure and free of Prisma so it can be unit tested and imported from a
// `"use server"` module, which may only export async functions.

/**
 * The name to look up on EA: the EA display name, falling back to the platform
 * id for rows created before the two were separated (2026-07-28).
 *
 * The fallback is what keeps the split from being a migration: on the day the
 * column appeared every member had `eaName = null`, and for the 76 whose
 * platform id already resolved, that id IS their EA display name. Dropping the
 * fallback would have unbound the whole roster at once.
 *
 * Null means there is nothing to search for, which is a legitimate state — an
 * admin who does not know a console member's EA name leaves it blank on purpose.
 */
export function eaLookupName(member: {
  eaName?: string | null;
  platformId?: string | null;
}): string | null {
  return member.eaName ?? member.platformId ?? null;
}
