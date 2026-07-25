"use client";

import { Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { DotsLoader } from "@/components/dots-loader";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import type { RankingEntry } from "../lib/queries";
import { fetchRankingPage, RANKING_PAGE_SIZE } from "../lib/ranking";
import { RankingRow } from "./ranking-row";

const SEARCH_DEBOUNCE_MS = 300;

interface RankingListProps {
  /** First page, rendered on the server so the list is never empty on arrival. */
  initialEntries: RankingEntry[];
  initialTotal: number;
  /** Highest score on the board, for the relative progress bars. */
  topPoints: number;
}

export function RankingList({
  initialEntries,
  initialTotal,
  topPoints,
}: RankingListProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [total, setTotal] = useState(initialTotal);
  const [hasMore, setHasMore] = useState(initialEntries.length < initialTotal);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  // Every fetch carries the query it was made for; stale replies are dropped.
  const activeQuery = useRef("");
  const sentinel = useRef<HTMLDivElement | null>(null);

  // Search: debounce, then reload from the first page.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === activeQuery.current) return;

    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const page = await fetchRankingPage({
          offset: 0,
          query: trimmed,
          signal: controller.signal,
        });
        activeQuery.current = trimmed;
        setEntries(page.entries);
        setTotal(page.total);
        setHasMore(page.hasMore);
        setFailed(false);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    const requestedFor = activeQuery.current;
    try {
      const page = await fetchRankingPage({
        offset: entries.length,
        query: requestedFor,
      });
      // A search may have landed while this was in flight.
      if (activeQuery.current !== requestedFor) return;
      setEntries((current) => [...current, ...page.entries]);
      setTotal(page.total);
      setHasMore(page.hasMore);
      setFailed(false);
    } catch {
      setFailed(true);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [entries.length, hasMore, loading]);

  // Infinite scroll: load the next page as the sentinel comes into view.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(
      (records) => {
        if (records[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  return (
    <div className="space-y-4">
      {/* Glass panel so the controls stay readable over the page background. */}
      <div className="bg-card/80 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-3 shadow-lg shadow-black/20 backdrop-blur-md">
        <div className="relative w-full max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar membro..."
            aria-label="Buscar membro no ranking"
            className="bg-background/50 pl-9"
          />
          {searching ? (
            <DotsLoader
              size="sm"
              label="Buscando"
              className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2"
            />
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm" role="status">
          {entries.length} de {total}
        </p>
      </div>

      {entries.length === 0 && !searching ? (
        <p className="text-muted-foreground bg-card/60 rounded-lg border border-dashed p-10 text-center backdrop-blur-sm">
          Nenhum membro encontrado.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <RankingRow
              key={entry.memberId}
              entry={entry}
              topPoints={topPoints}
            />
          ))}
        </div>
      )}

      {hasMore ? (
        <div ref={sentinel} className="space-y-2" aria-hidden>
          {/* Skeleton rows double as the scroll sentinel. */}
          {Array.from({ length: Math.min(3, RANKING_PAGE_SIZE) }).map((_, i) => (
            <Skeleton key={i} className="h-[58px] rounded-lg" />
          ))}
        </div>
      ) : null}

      {failed ? (
        <p className="text-muted-foreground text-center text-sm">
          Não foi possível carregar o ranking. Tente novamente.
        </p>
      ) : null}
    </div>
  );
}
