import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test-utils";

import type { RankingEntry } from "@/features/clan/lib/queries";
import { monthKey } from "@/lib/month";

function entry(rank: number, nickname: string, points: number): RankingEntry {
  return {
    rank,
    memberId: `m${rank}`,
    nickname,
    avatarUrl: null,
    platform: "ea",
    points,
    previousRank: null,
    progress: { kills: points, matches: 10, kd: 1.5, timePlayedMinutes: 120 },
  };
}

const BOARD = [entry(1, "RRRRRRRREST", 1240), entry(2, "Vortex", 980), entry(3, "Reaper", 640)];

/** Board long enough for the top-squad divider to have something to separate. */
function longBoard(size: number): RankingEntry[] {
  return Array.from({ length: size }, (_, i) => entry(i + 1, `Membro${i + 1}`, 1000 - i * 50));
}

const getMonthlyRanking = vi.fn();
const getRankingMonths = vi.fn();
// Who is reading the board. Hoisted because the factory below closes over the same spy,
// and mocked at all because `@/lib/auth/session` imports Prisma.
const { getSessionProfile } = vi.hoisted(() => ({ getSessionProfile: vi.fn() }));

// Stubbed: it calls useRouter, which needs a router context these tests do not
// provide, and its behaviour has its own suite (refresh-on-focus.test.tsx).
vi.mock("@/components/refresh-on-focus", () => ({ RefreshOnFocus: () => null }));

vi.mock("@/features/clan/lib/queries", () => ({
  getMonthlyRanking: (month: string) => getMonthlyRanking(month),
  getRankingMonths: () => getRankingMonths(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionProfile }));

import RankingPage from "./page";

const CURRENT = monthKey(new Date());

/** Renders the page the way the router would, with resolved searchParams. */
function renderPage(searchParams: { mes?: string } = {}) {
  return RankingPage({ searchParams: Promise.resolve(searchParams) });
}

beforeEach(() => {
  getMonthlyRanking.mockReset().mockResolvedValue(BOARD);
  getRankingMonths.mockReset().mockResolvedValue([CURRENT]);
  // A visitor by default, so the existing tests describe the page as anyone sees it.
  getSessionProfile.mockReset().mockResolvedValue(null);
});

// IntersectionObserver (used by the infinite scroll sentinel) is stubbed in
// vitest.setup.ts, alongside the other jsdom gaps.

describe("RankingPage", () => {
  it("renders the board", async () => {
    render(await renderPage());

    expect(screen.getByRole("heading", { level: 1, name: "Ranking" })).toBeInTheDocument();
    expect(screen.getByText("Vortex")).toBeInTheDocument();
  });

  it("gives the leader no hero strip of their own", async () => {
    // The scheme rewards squad play, so the page highlights the top four via the
    // divider instead of a spotlight band for #1 (decision of 2026-07-27). The
    // leader keeps their in-row treatment (gold surface plus crown) — what went
    // away is the page-wide panel that repeated them above the board.
    render(await renderPage());

    // The banner's own label is gone...
    expect(screen.queryByText("Líder do mês")).not.toBeInTheDocument();
    // ...so the first member is named once, in their row, and not again above it.
    expect(screen.getAllByText("RRRRRRRREST")).toHaveLength(1);
    // The in-row crown stays: it marks the leader without a band across the page.
    expect(screen.getByLabelText("Líder do mês")).toBeInTheDocument();
  });

  it("shows the countdown placeholder before mounting", async () => {
    render(await renderPage());
    expect(screen.getByText("Encerra em")).toBeInTheDocument();
  });

  it("offers the scoring rules behind a focusable trigger, not a footer block", async () => {
    render(await renderPage());

    // The rules moved out of a footer nobody scrolled to. A real button matters:
    // Radix opens the hover card on focus, which is how keyboard and touch reach it.
    const help = screen.getByRole("button", { name: /como pontuamos o ranking/i });
    expect(help).toBeInTheDocument();
    // Collapsed by default — the explanation is on demand now.
    expect(screen.queryByText(/Morte não desconta/i)).not.toBeInTheDocument();
  });

  it("keeps the countdown inside the search panel", async () => {
    render(await renderPage());

    // Same card as the search field, so the deadline no longer needs a band of
    // its own across the page.
    const search = screen.getByRole("searchbox", { name: /buscar membro/i });
    const panel = search.closest("div")?.parentElement;
    expect(panel).not.toBeNull();
    expect(panel).toHaveTextContent("Encerra em");
  });

  it("counts only the first page as loaded", async () => {
    render(await renderPage());
    expect(screen.getByRole("status")).toHaveTextContent("3 de 3");
  });
});

describe("top squad divider", () => {
  it("separates the first four from the rest", async () => {
    getMonthlyRanking.mockResolvedValue(longBoard(9));
    render(await renderPage());

    const separator = screen.getByRole("separator");
    expect(separator).toHaveTextContent("Demais membros");
  });

  it("stays hidden when the board is not longer than the top squad", async () => {
    getMonthlyRanking.mockResolvedValue(longBoard(4));
    render(await renderPage());
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });
});

describe("season history", () => {
  it("hides the picker when only one season exists", async () => {
    render(await renderPage());
    expect(
      screen.queryByRole("navigation", { name: "Temporadas do ranking" }),
    ).not.toBeInTheDocument();
  });

  it("offers every season that has a board", async () => {
    getRankingMonths.mockResolvedValue([CURRENT, "2026-06", "2026-05"]);
    render(await renderPage());

    const nav = screen.getByRole("navigation", { name: "Temporadas do ranking" });
    expect(nav).toBeInTheDocument();
    // The open season links to the clean URL; closed ones carry ?mes=.
    expect(screen.getByRole("link", { name: /junho/i })).toHaveAttribute(
      "href",
      "/ranking?mes=2026-06",
    );
  });

  it("renders a past season and drops the countdown", async () => {
    getRankingMonths.mockResolvedValue([CURRENT, "2026-06"]);
    render(await renderPage({ mes: "2026-06" }));

    expect(getMonthlyRanking).toHaveBeenCalledWith("2026-06");
    expect(screen.getByText(/temporada encerrada/i)).toBeInTheDocument();
    // The countdown only means something while the season can still change.
    expect(screen.queryByText("Encerra em")).not.toBeInTheDocument();
  });

  it("shows only the top ten of a closed season", async () => {
    getRankingMonths.mockResolvedValue([CURRENT, "2026-06"]);
    getMonthlyRanking.mockResolvedValue(longBoard(40));
    render(await renderPage({ mes: "2026-06" }));

    expect(screen.getByRole("status")).toHaveTextContent("10 de 10");
    expect(screen.getByText(/10 melhores colocados/i)).toBeInTheDocument();
    expect(screen.getByText("Membro10")).toBeInTheDocument();
    expect(screen.queryByText("Membro11")).not.toBeInTheDocument();
  });

  it("drops the top-squad divider on a closed season", async () => {
    // A 10-row podium has no "everyone else" to separate from.
    getRankingMonths.mockResolvedValue([CURRENT, "2026-06"]);
    getMonthlyRanking.mockResolvedValue(longBoard(40));
    render(await renderPage({ mes: "2026-06" }));

    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("keeps the open season uncapped and divided", async () => {
    getMonthlyRanking.mockResolvedValue(longBoard(40));
    render(await renderPage());

    expect(screen.getByRole("status")).toHaveTextContent("15 de 40");
    expect(screen.queryByText(/melhores colocados/i)).not.toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("falls back to the open season when ?mes= is unknown or malformed", async () => {
    getRankingMonths.mockResolvedValue([CURRENT, "2026-06"]);

    render(await renderPage({ mes: "nao-e-um-mes" }));
    expect(getMonthlyRanking).toHaveBeenCalledWith(CURRENT);

    getMonthlyRanking.mockClear();
    // Well-formed but with no board — a stale shared link must still land somewhere.
    render(await renderPage({ mes: "2019-01" }));
    expect(getMonthlyRanking).toHaveBeenCalledWith(CURRENT);
  });
});

describe("RankingPage — a própria linha do visitante logado", () => {
  /** The row element for a nickname, which is the <a> the whole card lives in. */
  function rowOf(nickname: string) {
    return screen.getByText(nickname).closest("a")!;
  }

  it("circles the signed-in member's own row", async () => {
    getSessionProfile.mockResolvedValue({ id: "u1", isAdmin: false, memberId: "m2", member: null });

    render(await renderPage());

    expect(rowOf("Vortex").className).toContain("outline-primary/50");
    // And only theirs.
    expect(rowOf("RRRRRRRREST").className).not.toContain("outline-primary/50");
  });

  it("says it in text too, since a ring is invisible to a screen reader", async () => {
    getSessionProfile.mockResolvedValue({ id: "u1", isAdmin: false, memberId: "m2", member: null });

    render(await renderPage());

    expect(rowOf("Vortex")).toHaveTextContent("(você)");
  });

  it("marks nobody for a visitor", async () => {
    getSessionProfile.mockResolvedValue(null);

    render(await renderPage());

    for (const nickname of ["RRRRRRRREST", "Vortex", "Reaper"]) {
      expect(rowOf(nickname).className).not.toContain("outline-primary/50");
    }
  });

  it("marks nobody when the login is not linked to a member", async () => {
    // Signed in, part of no clan member: there is no row to be theirs.
    getSessionProfile.mockResolvedValue({ id: "u1", isAdmin: false, memberId: null, member: null });

    render(await renderPage());

    expect(rowOf("Vortex").className).not.toContain("outline-primary/50");
  });

  it("keeps the leader's gold AND the ring when the reader is first", async () => {
    // Two different facts, on two different properties. Recolouring the border would have
    // made one of them unsayable.
    getSessionProfile.mockResolvedValue({ id: "u1", isAdmin: false, memberId: "m1", member: null });

    render(await renderPage());

    const leader = rowOf("RRRRRRRREST");
    expect(leader.className).toContain("outline-primary/50");
    expect(leader.className).toContain("border-yellow");
  });

  it("renders far enough down the board to actually show the mark", async () => {
    // The board reveals in batches, so a member in 40th would otherwise have to scroll
    // past everyone else to find the mark that exists to save them the scrolling.
    getMonthlyRanking.mockResolvedValue(longBoard(60));
    getSessionProfile.mockResolvedValue({
      id: "u1",
      isAdmin: false,
      memberId: "m40",
      member: null,
    });

    render(await renderPage());

    expect(screen.getByText("Membro40")).toBeInTheDocument();
    expect(rowOf("Membro40").className).toContain("outline-primary/50");
    // Still not the whole board: only as far as it had to go.
    expect(screen.queryByText("Membro60")).not.toBeInTheDocument();
  });
});
