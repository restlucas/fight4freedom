// Shared contract between the ranking route handler and the client list, so the
// page size and the response shape can never disagree.

import type { RankingEntry } from "./queries";

export const RANKING_PAGE_SIZE = 15;

export type RankingPage = {
  entries: RankingEntry[];
  total: number;
  hasMore: boolean;
};

/** Fetches one page of the monthly ranking. Throws on a non-OK response. */
export async function fetchRankingPage(params: {
  offset: number;
  query?: string;
  signal?: AbortSignal;
}): Promise<RankingPage> {
  const search = new URLSearchParams({
    offset: String(params.offset),
    limit: String(RANKING_PAGE_SIZE),
  });
  if (params.query?.trim()) search.set("q", params.query.trim());

  const response = await fetch(`/api/ranking?${search}`, {
    signal: params.signal,
  });
  if (!response.ok) {
    throw new Error(`Ranking request failed with ${response.status}`);
  }
  return (await response.json()) as RankingPage;
}
