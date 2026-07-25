import { describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test-utils";

vi.mock("@/features/clan/lib/queries", () => ({
  // This member leads the clan in kills, so the Kills tile gets a crown.
  getStatLeaders: vi.fn().mockResolvedValue({
    kd: [],
    kills: ["m1"],
    matches: [],
    hours: [],
  }),
  getMemberProfile: vi.fn().mockResolvedValue({
    id: "m1",
    nickname: "RRRRRRRREST",
    platform: "ea",
    platformId: "RRRRRRRREST",
    role: "admin",
    avatarUrl: null,
    rankPoints: 13_000, // General de Divisão, 3.000 short of the next rank
    // The data layer serializes dates as ISO strings (the cache is JSON).
    joinedAt: "2025-10-01T00:00:00.000Z",
    bestClass: "assault",
    medalCount: 1,
    totals: {
      kills: 200,
      deaths: 100,
      wins: 12,
      losses: 8,
      assists: 50,
      revives: 30,
      headshots: 40,
      objectivesCaptured: 15,
      timePlayedMinutes: 120,
    },
    medals: [
      {
        id: "md1",
        name: "Sharpshooter",
        tier: "legendary",
        icon: "crosshair",
        imageUrl: null,
        criteria: "20 kills without dying",
        description: null,
        awardedAt: "2026-07-01T00:00:00.000Z",
      },
    ],
    progression: [],
  }),
}));

import MemberProfilePage from "./page";

describe("MemberProfilePage", () => {
  it("renders the member name, stats and medals", async () => {
    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));
    expect(
      screen.getByRole("heading", { name: "RRRRRRRREST", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Estatísticas")).toBeInTheDocument();
    expect(screen.getByText("Sharpshooter")).toBeInTheDocument();
    // Best class shows in the header badge and in the stats grid.
    expect(screen.getAllByText("Assalto").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/1 de outubro de 2025/)).toBeInTheDocument();
  });

  it("shows the rank card with a progress bar and no points on its face", async () => {
    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));
    expect(screen.getByText("General de Divisão")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", {
        name: "Progresso para General de Exército",
      }),
    ).toBeInTheDocument();
    // The numbers only show on hover, inside the hover card.
    expect(screen.queryByText(/13\.000/)).not.toBeInTheDocument();
  });

  it("falls back to the default artwork when there is no best class", async () => {
    const { getMemberProfile } = await import("@/features/clan/lib/queries");
    const base = await (
      getMemberProfile as unknown as () => Promise<Record<string, unknown>>
    )();
    vi.mocked(
      getMemberProfile as unknown as (id: string) => Promise<unknown>,
    ).mockResolvedValueOnce({ ...base, bestClass: null });

    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));

    const header = screen.getByRole("banner");
    const background = header.querySelector("img");
    expect(background?.getAttribute("src")).toContain("background.avif");
  });

  it("shows the platform icon with the platform id", async () => {
    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));
    expect(
      screen.getByLabelText(/Plataforma: EA · RRRRRRRREST/),
    ).toBeInTheDocument();
  });

  it("crowns the stats the member leads in the clan", async () => {
    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));
    expect(screen.getByLabelText("Líder do clã em Kills")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Líder do clã em Partidas"),
    ).not.toBeInTheDocument();
  });
});
