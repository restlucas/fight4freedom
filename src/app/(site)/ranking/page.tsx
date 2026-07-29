import type { Metadata } from "next";
import Image from "next/image";

import { RefreshOnFocus } from "@/components/refresh-on-focus";
import { RankingList } from "@/features/clan/components/ranking-list";
import { RankingMonthPicker } from "@/features/clan/components/ranking-month-picker";
import { RankingScoringHelp } from "@/features/clan/components/ranking-scoring-help";
import { formatMonthLabel } from "@/features/clan/lib/format";
import { getMonthlyRanking, getRankingMonths } from "@/features/clan/lib/queries";
import {
  RANKING_HISTORY_LIMIT,
  RANKING_PAGE_SIZE,
  visibleBoard,
} from "@/features/clan/lib/ranking";
import { isMonthKey, monthEndsAt, monthKey, monthKeyToReference } from "@/lib/month";

export const metadata: Metadata = {
  title: "Ranking",
  description:
    "Ranking mensal do clã Fight4Freedom: pontos pelo progresso em kills, partidas e objetivos.",
};

// DB-backed vitrine: render at request time so it always reflects current data.
export const dynamic = "force-dynamic";

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const now = new Date();
  const currentSeason = monthKey(now);
  const { mes } = await searchParams;

  // Past seasons come from the archive of snapshots, so the picker offers only
  // months that really have a board. An unknown or malformed `?mes=` falls back
  // to the open season instead of 404-ing: a stale shared link should still land
  // somewhere useful.
  const availableMonths = await getRankingMonths();
  const months = availableMonths.includes(currentSeason)
    ? availableMonths
    : [currentSeason, ...availableMonths];
  const month = isMonthKey(mes) && months.includes(mes) ? mes : currentSeason;
  const isOpenSeason = month === currentSeason;

  // The board is cached per season; the label and the countdown below stay
  // outside the cache so they are always exact. A closed season is capped to its
  // top places here rather than inside the cached query, which must not depend on
  // today's date (see src/lib/cache.ts).
  const board = visibleBoard(await getMonthlyRanking(month), isOpenSeason);

  // No single-member spotlight: the scoring scheme rewards squad play, so the
  // page highlights the top FOUR through the divider in the list instead of
  // crowning a #1 (decision of 2026-07-27). `topPoints` stays because the rows
  // size their progress bars against the leader's score.
  const topPoints = board[0]?.points ?? 0;

  return (
    <>
      {/* The board is only as fresh as the render that produced it, and a collection
          lands every 20 min. This refetches it when the visitor comes back to the
          tab, so a page left open does not serve yesterday's positions. */}
      <RefreshOnFocus />
      {/* Fixed page background: stays put while the board scrolls. */}
      {/* w-screen: see the same background in /membros — 100vw does not change when
          an overlay removes the scrollbar. */}
      <div aria-hidden className="fixed inset-y-0 left-0 -z-10 w-screen">
        <Image
          src="/background-2.avif"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        {/* Shadow overlay: flat scrim plus a fade into the page background, so
            the translucent rows and controls keep their contrast. */}
        <div className="bg-background/75 absolute inset-0" />
        <div className="from-background/50 via-background/20 to-background absolute inset-0 bg-gradient-to-b" />
      </div>

      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <header className="mb-5 space-y-1">
          <h1 className="font-heading text-3xl font-bold drop-shadow-sm">Ranking</h1>
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
            <span>
              Temporada de {formatMonthLabel(monthKeyToReference(month))}
              {isOpenSeason ? " · pontos pelo progresso do mês." : " · temporada encerrada."}
            </span>
            <RankingScoringHelp />
          </p>
        </header>

        <RankingMonthPicker
          months={months}
          current={month}
          currentSeason={currentSeason}
          className="mb-5"
        />

        {board.length === 0 ? (
          <p className="text-muted-foreground bg-card/60 rounded-lg border border-dashed p-10 text-center backdrop-blur-sm">
            {isOpenSeason
              ? "Nenhum membro no ranking ainda."
              : "Esta temporada não tem pontuação registrada."}
          </p>
        ) : (
          <RankingList
            key={month}
            initialEntries={board.slice(0, RANKING_PAGE_SIZE)}
            initialTotal={board.length}
            topPoints={topPoints}
            month={month}
            // The countdown only means something while the season can still change.
            endsAt={isOpenSeason ? monthEndsAt(now).toISOString() : null}
            limitedToTop={isOpenSeason ? null : RANKING_HISTORY_LIMIT}
          />
        )}
      </main>
    </>
  );
}
