import type { Metadata } from "next";
import Image from "next/image";

import { RankingList } from "@/features/clan/components/ranking-list";
import { RankingSeasonBar } from "@/features/clan/components/ranking-season-bar";
import { formatMonthLabel } from "@/features/clan/lib/format";
import { getMonthlyRanking } from "@/features/clan/lib/queries";
import { RANKING_PAGE_SIZE } from "@/features/clan/lib/ranking";
import { monthEndsAt, monthKey } from "@/lib/month";
import { POINT_WEIGHTS, SCORED_STATS } from "@/lib/stats/points";

export const metadata: Metadata = {
  title: "Ranking",
  description:
    "Ranking mensal do clã Fight4Freedom: pontos pelo progresso em kills, partidas e objetivos.",
};

// DB-backed vitrine: render at request time so it always reflects current data.
export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const now = new Date();
  // The board is cached per season; the label and the countdown below stay
  // outside the cache so they are always exact.
  const board = await getMonthlyRanking(monthKey(now));

  const leader = board[0]?.points ? board[0] : null;
  const topPoints = board[0]?.points ?? 0;

  return (
    <>
      {/* Fixed page background: stays put while the board scrolls. */}
      <div aria-hidden className="fixed inset-0 -z-10">
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
          <h1 className="font-heading text-3xl font-bold drop-shadow-sm">
            Ranking
          </h1>
          <p className="text-muted-foreground text-sm">
            Temporada de {formatMonthLabel(now)} · pontos pelo progresso do mês.
          </p>
        </header>

        <RankingSeasonBar
          leader={leader}
          endsAt={monthEndsAt(now).toISOString()}
          className="mb-6"
        />

        {board.length === 0 ? (
          <p className="text-muted-foreground bg-card/60 rounded-lg border border-dashed p-10 text-center backdrop-blur-sm">
            Nenhum membro no ranking ainda.
          </p>
        ) : (
          <RankingList
            initialEntries={board.slice(0, RANKING_PAGE_SIZE)}
            initialTotal={board.length}
            topPoints={topPoints}
          />
        )}

        {/* The scoring rules are provisional; stating them beats a mystery number
            next to each member. */}
        <footer className="text-muted-foreground bg-card/60 mt-8 rounded-lg border px-4 py-3 text-xs backdrop-blur-sm">
          <span className="font-semibold">Como pontuamos (provisório):</span>{" "}
          {SCORED_STATS.map(({ key, label }) => {
            const weight = POINT_WEIGHTS[key];
            return `${label} ${weight > 0 ? "+" : ""}${weight}`;
          }).join(" · ")}
          . Conta apenas o progresso feito dentro do mês.
        </footer>
      </main>
    </>
  );
}
