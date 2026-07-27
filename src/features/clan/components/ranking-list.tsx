"use client";

import { Search, Timer } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import { DotsLoader } from "@/components/dots-loader";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import type { RankingEntry } from "../lib/queries";
import { fetchRankingPage, RANKING_PAGE_SIZE } from "../lib/ranking";
import { RankingCountdown } from "./ranking-countdown";
import { RankingRow } from "./ranking-row";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Members shown above the divider. Four, not three: the clan fields squads of
 * four, so the cut reads as "the squad on top" rather than an olympic podium.
 */
export const RANKING_HIGHLIGHT_COUNT = 4;

interface RankingListProps {
  /** First page, rendered on the server so the list is never empty on arrival. */
  initialEntries: RankingEntry[];
  initialTotal: number;
  /** Highest score on the board, for the relative progress bars. */
  topPoints: number;
  /** Season being shown, so paging and searching stay on it. */
  month: string;
  /**
   * ISO instant when the season closes; null or absent for a closed one.
   *
   * It rides in this panel instead of a hero strip of its own: with no single
   * member spotlighted, the deadline became the only page-level fact left, and
   * one fact does not justify a band across the page.
   */
  endsAt?: string | null;
  /**
   * Set on a closed season, where the board only shows this many places. It
   * replaces the top-squad divider with a plain label: the divider means "the
   * squad on top, then everyone else", and on a 10-row podium there is no
   * "everyone else" to separate from.
   */
  limitedToTop?: number | null;
}

export function RankingList({
  initialEntries,
  initialTotal,
  topPoints,
  month,
  endsAt,
  limitedToTop,
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
          month,
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
  }, [query, month]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    const requestedFor = activeQuery.current;
    try {
      const page = await fetchRankingPage({
        offset: entries.length,
        month,
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
  }, [entries.length, hasMore, loading, month]);

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

  // `query` (not activeQuery) so the cut disappears as soon as the member types,
  // instead of lingering for the debounce window.
  const showHighlightDivider =
    !limitedToTop && query.trim() === "" && entries.length > RANKING_HIGHLIGHT_COUNT;

  return (
    <div className="space-y-4">
      {/* Glass panel so the controls stay readable over the page background.
          Fixed height from `md` up, where the row is guaranteed to fit: it stops
          this panel from being the tallest block on the page. Below `md` the
          height stays auto so the controls may wrap — capping there would clip
          the search field instead of shortening the card.
          `md:flex-nowrap` is only safe because the search field is allowed to
          shrink (min-w-0 below) while the counter and clock hold their size;
          otherwise a one-row lock would overflow the fixed height. */}
      <div className="bg-card/80 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-3 shadow-lg shadow-black/20 backdrop-blur-md md:h-15 md:flex-nowrap">
        <div className="relative w-full max-w-xs min-w-0">
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
        <p className="text-muted-foreground shrink-0 text-sm" role="status">
          {entries.length} de {total}
        </p>

        {/* Pushed to the far edge with ml-auto rather than justify-between on the
            parent: the panel wraps on narrow screens, and justify-between would
            spread the search field and the counter apart once they share a row.

            Icon and label sit BESIDE the digits, not above them: stacked, they
            made this panel the tallest thing on the page for no information gain. */}
        {endsAt ? (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Timer className="text-primary size-4 shrink-0" aria-hidden />
            <p className="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">
              Encerra em
            </p>
            <RankingCountdown endsAt={endsAt} />
          </div>
        ) : null}

        {/* A closed season has no countdown, so the same right-hand slot says what
            the shortened list is instead of leaving the card looking truncated. */}
        {limitedToTop ? (
          <p className="text-muted-foreground ml-auto shrink-0 text-[10px] font-semibold tracking-widest uppercase">
            {limitedToTop} melhores colocados
          </p>
        ) : null}
      </div>

      {entries.length === 0 && !searching ? (
        <p className="text-muted-foreground bg-card/60 rounded-lg border border-dashed p-10 text-center backdrop-blur-sm">
          Nenhum membro encontrado.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <Fragment key={entry.memberId}>
              <RankingRow entry={entry} topPoints={topPoints} />
              {/* Divider after the top squad. Suppressed while searching: a
                  filtered list is not a board, so a cut at the 4th result would
                  mark an arbitrary row. Also suppressed when the board is not
                  long enough for the cut to separate anything. */}
              {showHighlightDivider && index === RANKING_HIGHLIGHT_COUNT - 1 ? (
                <div className="flex items-center gap-3 py-2" role="separator">
                  <span className="bg-border h-px flex-1" />
                  <span className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
                    Demais membros
                  </span>
                  <span className="bg-border h-px flex-1" />
                </div>
              ) : null}
            </Fragment>
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
