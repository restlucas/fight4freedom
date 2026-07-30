// Sorting for the members table: which columns can be ordered, and by what.
//
// ONE SORT AT A TIME, and that is the reason this module exists at all. Until now the
// Stats column owned its own three-state toggle, which worked because it was the only
// one. Four more independent toggles would have no answer to "the table is sorted by
// Cargo AND by Entrou, which wins" — so the state became a single `{ column, direction }`
// and every column feeds the same comparator.
//
// The comparators are here rather than inline in the component because two of the five
// are JUDGEMENTS, not orderings that fall out of the data: `role` and `activity` both
// sort by meaning, and alphabetical would be actively misleading for either.

import { activityUrgency } from "./member-activity";
import { syncUrgency } from "./member-sync";
import type { AdminMember } from "./queries";
import { MEMBER_ROLES } from "./schemas";

export type SortColumn = "nickname" | "role" | "joinedAt" | "activity" | "sync";
export type SortDirection = "asc" | "desc";
export type MemberSort = { column: SortColumn; direction: SortDirection };

/** Stable tie-break, always ascending, so equal rows never shuffle between renders. */
function byNickname(a: AdminMember, b: AdminMember): number {
  return a.nickname.localeCompare(b.nickname, "pt-BR");
}

/**
 * The `asc` comparison for one column. `desc` is this negated — see `sortMembers`, which
 * is also where absent values are pinned so negating cannot drag them to the top.
 *
 * What `asc` MEANS per column, because for three of them it is a decision:
 *
 *   nickname  A to Z
 *   role      lowest cargo first, using the hierarchy in MEMBER_ROLES and never the
 *             alphabet — alphabetical would read admin, member, officer, which is not
 *             an order anyone means by "cargo"
 *   joinedAt  oldest first, so the veterans lead
 *   activity  needs attention first (see ACTIVITY_STATES_BY_URGENCY)
 *   sync      needs attention first (see SYNC_STATES_BY_URGENCY)
 */
function compare(a: AdminMember, b: AdminMember, column: SortColumn): number {
  switch (column) {
    case "nickname":
      return byNickname(a, b);
    case "role":
      return MEMBER_ROLES.indexOf(a.role) - MEMBER_ROLES.indexOf(b.role);
    case "joinedAt":
      // Both non-null here: nulls never reach this (see `pinnedLast`). String comparison
      // is safe because every value comes from `toISOString()`, which is fixed-width UTC,
      // so lexical order IS chronological order.
      return (a.joinedAt ?? "").localeCompare(b.joinedAt ?? "");
    case "activity": {
      const byState = activityUrgency(a.activity.state) - activityUrgency(b.activity.state);
      // Within a bucket, the quietest first: two members both at "14+ dias" are not
      // equally worth a message when one has been gone for 15 days and the other 80.
      return byState || (b.activity.daysSince ?? 0) - (a.activity.daysSince ?? 0);
    }
    case "sync":
      return syncUrgency(a.sync.state) - syncUrgency(b.sync.state);
  }
}

/**
 * Rows whose value for this column is ABSENT, forced to the bottom in both directions.
 *
 * Only `joinedAt` has this, and it matters: a member with no join date is unknown, not
 * ancient. Letting the direction flip them would put "we do not know" at the top of
 * "mais recentes primeiro" and read as a claim.
 */
function pinnedLast(a: AdminMember, b: AdminMember, column: SortColumn): number {
  if (column !== "joinedAt") return 0;
  const missingA = a.joinedAt === null;
  const missingB = b.joinedAt === null;
  if (missingA === missingB) return 0;
  return missingA ? 1 : -1;
}

/**
 * A sorted copy, or the original array when nothing is sorted.
 *
 * Copies before sorting: the input may be the array the server handed the component, and
 * sorting in place would mutate a prop.
 */
export function sortMembers(
  members: readonly AdminMember[],
  sort: MemberSort | null,
): readonly AdminMember[] {
  if (sort === null) return members;

  const factor = sort.direction === "asc" ? 1 : -1;
  return [...members].sort((a, b) => {
    const pin = pinnedLast(a, b, sort.column);
    if (pin !== 0) return pin;
    // The tie-break is NOT negated: reversing names inside a tie makes the order look
    // unstable to anyone toggling a direction back and forth.
    return factor * compare(a, b, sort.column) || byNickname(a, b);
  });
}

/**
 * Click behaviour: a column cycles asc, desc, off; a different column starts at asc.
 *
 * Three states rather than two because "off" is a real answer — the default order (active
 * members first, then nickname) is what an admin wants back after a look, and without a
 * way to return to it the only route is a page reload.
 */
export function nextSort(current: MemberSort | null, column: SortColumn): MemberSort | null {
  if (current === null || current.column !== column) return { column, direction: "asc" };
  if (current.direction === "asc") return { column, direction: "desc" };
  return null;
}
