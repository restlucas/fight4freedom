// Shared rules for the ranking board: how much of it a season may expose, how
// many rows the list reveals at a time, and how the search matches.
//
// WHY THERE IS NO PAGING ENDPOINT ANY MORE (2026-07-30)
//
// The board used to arrive in pages: the server rendered the first 15 rows and
// the browser fetched the rest from `GET /api/ranking` as the visitor scrolled.
// Each request recomputed the board from scratch, so the pages the client glued
// together came from DIFFERENT boards — and the board moves, because a
// collection lands every 20 minutes and purges the stats tag.
//
// That is a duplicate waiting to happen at every page boundary. Measured on
// 2026-07-29: ApodiOLoko sat on 589 points at rank 16 with 6 points separating
// ranks 14 and 15, and a single session is worth about fifty. Slipping one place
// between the page render and the scroll put them in the first page as 15th and
// again in the second as 16th. The mirror case is worse and invisible: a member
// who CLIMBS across the boundary is in neither page and vanishes from the list.
//
// Offset paging over a moving list cannot be fixed with a dedupe — the hole
// stays. So the whole board now travels with the page and the client only
// reveals it progressively. At 99 members that is roughly 25 KB of JSON, less
// than one avatar, and the query already built the full array on every call. If
// this clan ever passes a few thousand members, paging comes back — with a
// board snapshot pinned per visitor, not a bare offset.

import { normalizeSearch } from "./format";
import type { RankingEntry } from "./queries";

/** How many rows the list reveals at a time as the visitor scrolls. */
export const RANKING_PAGE_SIZE = 15;

/**
 * How many places a CLOSED season shows. The open month is the competition, so it
 * lists everyone; a finished month is a record, and the record worth keeping is
 * the podium, not the ninetieth place of a month nobody can change any more.
 *
 * Applied by the page rather than by `getMonthlyRanking`, because capping it in
 * the cached query would make it depend on the current date (see src/lib/cache.ts).
 */
export const RANKING_HISTORY_LIMIT = 10;

/** The board a season is allowed to expose, already capped when it is closed. */
export function visibleBoard<T>(board: T[], isOpenSeason: boolean): T[] {
  return isOpenSeason ? board : board.slice(0, RANKING_HISTORY_LIMIT);
}

/**
 * Rows whose nickname matches the search, ignoring case and diacritics.
 *
 * Filters the board that is already on screen, so every row keeps the rank it
 * holds on the full board: searching narrows the list, it never renumbers it.
 */
export function filterBoard(board: RankingEntry[], query: string): RankingEntry[] {
  const needle = normalizeSearch(query);
  if (!needle) return board;
  return board.filter((entry) => normalizeSearch(entry.nickname).includes(needle));
}
