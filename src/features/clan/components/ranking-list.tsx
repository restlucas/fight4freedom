"use client";

import { Search, Timer } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import type { RankingEntry } from "../lib/queries";
import { filterBoard, RANKING_PAGE_SIZE } from "../lib/ranking";
import { RankingCountdown } from "./ranking-countdown";
import { RankingRow } from "./ranking-row";

/**
 * Members shown above the divider. Four, not three: the clan fields squads of
 * four, so the cut reads as "the squad on top" rather than an olympic podium.
 */
export const RANKING_HIGHLIGHT_COUNT = 4;

interface RankingListProps {
  /**
   * The WHOLE board for the season, already capped when it is closed. Not a page:
   * this list reveals and searches locally, because gluing together pages fetched
   * at different instants is what put the same member in two places (see
   * ../lib/ranking.ts).
   */
  board: RankingEntry[];
  /**
   * The signed-in member's id, when there is one, so their own row can be marked.
   *
   * Null for a visitor and for a signed-in user whose login is not linked to a
   * member — both cases simply get no highlight.
   */
  viewerMemberId?: string | null;
  /** Highest score on the board, for the relative progress bars. */
  topPoints: number;
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
  board,
  topPoints,
  endsAt,
  limitedToTop,
  viewerMemberId = null,
}: RankingListProps) {
  const [query, setQuery] = useState("");
  /**
   * Starts wide enough to include the viewer's own row.
   *
   * Without this the highlight is a promise the page does not keep: the board reveals
   * RANKING_PAGE_SIZE rows at a time, so a member in 60th place would have to scroll past
   * everyone else to find the mark that exists to save them the scrolling. Rendering
   * further down costs nothing here — the whole board is already in the client, by the
   * design decision in lib/ranking.ts.
   */
  const [visibleCount, setVisibleCount] = useState(() => {
    const own = viewerMemberId ? board.findIndex((entry) => entry.memberId === viewerMemberId) : -1;
    return own === -1 ? RANKING_PAGE_SIZE : Math.max(RANKING_PAGE_SIZE, own + 1);
  });

  const sentinel = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => filterBoard(board, query), [board, query]);
  const entries = filtered.slice(0, visibleCount);
  const hasMore = entries.length < filtered.length;

  // Infinite scroll: reveal the next rows as the sentinel comes into view.
  //
  // `visibleCount` is a dependency so the observer is rebuilt after each reveal:
  // an element that is already intersecting never crosses the threshold again, so
  // without this a long viewport would stop after one batch. A fresh `observe()`
  // reports the current state, which keeps revealing until the sentinel is pushed
  // off screen.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(
      (records) => {
        if (records[0]?.isIntersecting) {
          setVisibleCount((current) => current + RANKING_PAGE_SIZE);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, visibleCount]);

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
            onChange={(event) => {
              setQuery(event.target.value);
              // A new search starts at the top of its own result list.
              setVisibleCount(RANKING_PAGE_SIZE);
            }}
            placeholder="Buscar membro..."
            aria-label="Buscar membro no ranking"
            className="bg-background/50 pl-9"
          />
          {/* No spinner and no debounce here any more: the board is already in
              memory, so the filter lands on the same keystroke. */}
        </div>
        <p className="text-muted-foreground shrink-0 text-sm" role="status">
          {entries.length} de {filtered.length}
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

      {entries.length === 0 ? (
        <p className="text-muted-foreground bg-card/60 rounded-lg border border-dashed p-10 text-center backdrop-blur-sm">
          Nenhum membro encontrado.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <Fragment key={entry.memberId}>
              <RankingRow
                entry={entry}
                topPoints={topPoints}
                isViewer={entry.memberId === viewerMemberId}
              />
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
          {/* Skeleton rows double as the scroll sentinel. They stand for rows that
              exist and are not painted yet, not for a request in flight — there is
              no request any more, so they are replaced on the same frame. */}
          {Array.from({ length: Math.min(3, RANKING_PAGE_SIZE) }).map((_, i) => (
            <Skeleton key={i} className="h-[58px] rounded-lg" />
          ))}
        </div>
      ) : null}
    </div>
  );
}
