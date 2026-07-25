// Paginated monthly ranking, used by the infinite scroll on /ranking. The first
// page is rendered on the server by the page itself; this endpoint serves the
// pages after it and every search.

import { NextResponse } from "next/server";

import { normalizeSearch } from "@/features/clan/lib/format";
import { getMonthlyRanking } from "@/features/clan/lib/queries";
import {
  RANKING_PAGE_SIZE,
  type RankingPage,
} from "@/features/clan/lib/ranking";
import { monthKey } from "@/lib/month";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 50;

function positiveInt(raw: string | null, fallback: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export async function GET(request: Request): Promise<NextResponse<RankingPage>> {
  const params = new URL(request.url).searchParams;
  const offset = positiveInt(params.get("offset"), 0, 10_000);
  const limit = positiveInt(params.get("limit"), RANKING_PAGE_SIZE, MAX_LIMIT);
  const query = normalizeSearch(params.get("q") ?? "");

  // Ranks come from the full board, so filtering afterwards keeps each member's
  // real position instead of renumbering the search result.
  const board = await getMonthlyRanking(monthKey(new Date()));
  const filtered = query
    ? board.filter((entry) => normalizeSearch(entry.nickname).includes(query))
    : board;

  const entries = filtered.slice(offset, offset + Math.max(1, limit));

  return NextResponse.json({
    entries,
    total: filtered.length,
    hasMore: offset + entries.length < filtered.length,
  });
}
