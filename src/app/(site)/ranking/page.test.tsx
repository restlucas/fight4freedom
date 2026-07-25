import { describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test-utils";

import type { RankingEntry } from "@/features/clan/lib/queries";

function entry(
  rank: number,
  nickname: string,
  points: number,
): RankingEntry {
  return {
    rank,
    memberId: `m${rank}`,
    nickname,
    avatarUrl: null,
    platform: "ea",
    points,
    progress: { kills: points, matches: 10, kd: 1.5, timePlayedMinutes: 120 },
  };
}

vi.mock("@/features/clan/lib/queries", () => ({
  getMonthlyRanking: vi
    .fn()
    .mockResolvedValue([
      entry(1, "RRRRRRRREST", 1240),
      entry(2, "Vortex", 980),
      entry(3, "Reaper", 640),
    ]),
}));

import RankingPage from "./page";

// IntersectionObserver (used by the infinite scroll sentinel) is stubbed in
// vitest.setup.ts, alongside the other jsdom gaps.

describe("RankingPage", () => {
  it("renders the board with the leader highlighted", async () => {
    render(await RankingPage());

    expect(
      screen.getByRole("heading", { level: 1, name: "Ranking" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Líder do mês")).toBeInTheDocument();
    // Leader shows both in the season bar and in the first row.
    expect(screen.getAllByText("RRRRRRRREST").length).toBe(2);
    expect(screen.getByText("Vortex")).toBeInTheDocument();
    expect(screen.getByLabelText("Líder do mês")).toBeInTheDocument();
  });

  it("shows the countdown placeholder before mounting and the point rules", async () => {
    render(await RankingPage());
    expect(screen.getByText("Encerra em")).toBeInTheDocument();
    expect(screen.getByText(/Como pontuamos/)).toBeInTheDocument();
  });

  it("counts only the first page as loaded", async () => {
    render(await RankingPage());
    expect(screen.getByRole("status")).toHaveTextContent("3 de 3");
  });

  it("shows only the score and a link to the profile on each row", async () => {
    render(await RankingPage());

    // One link per member, and nothing else clickable inside the row.
    const rows = screen.getAllByRole("link");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveAttribute("href", "/membros/m1");
    // Leader points: once in the season bar, once in the row.
    expect(screen.getAllByText(/1\.240/).length).toBeGreaterThan(0);
    // The per-stat numbers moved to the profile page.
    expect(screen.queryByText(/\d+ kills/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ partidas/)).not.toBeInTheDocument();
    expect(screen.queryByText(/K\/D/)).not.toBeInTheDocument();
  });
});
