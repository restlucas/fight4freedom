import { describe, expect, it, vi } from "vitest";

import { rankForPoints, rankProgress } from "@/lib/ranks";
import { render, screen } from "@/test-utils";

// Stubbed: it calls useRouter, which needs a router context these tests do not
// provide, and its behaviour has its own suite (refresh-on-focus.test.tsx).
vi.mock("@/components/refresh-on-focus", () => ({ RefreshOnFocus: () => null }));

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
    // A literal, because vi.mock is hoisted above the imports and cannot read the
    // ladder. The ASSERTION derives the expected rank from these points instead,
    // so a recalibration (2026-07-28, and again when the weights are retuned)
    // changes which rank is expected without touching the fixture.
    rankPoints: 13_000,
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
    // 40 headshots over 400 all-mode kills = 10 %.
    headshotRate: 0.1,
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
    // Empty on purpose: most of the roster is here today (collection started on
    // 27/07), so the empty state is the common case and gets its own test.
    progression: [],
  }),
}));

import MemberProfilePage from "./page";

describe("MemberProfilePage", () => {
  it("renders the member name, stats and medals", async () => {
    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));
    expect(screen.getByRole("heading", { name: "RRRRRRRREST", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Estatísticas")).toBeInTheDocument();
    expect(screen.getByText("Sharpshooter")).toBeInTheDocument();
    // Best class shows in the header badge and in the stats grid.
    expect(screen.getAllByText("Assalto").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/1 de outubro de 2025/)).toBeInTheDocument();
  });

  it("shows the headshot tile as a percentage, not an absolute count", async () => {
    // Absolutes here are not comparable with the Kills tile beside them: headshots
    // include bots, kills do not, which is how a member showed more headshots than
    // kills. The label carries the unit so the number is never ambiguous.
    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));
    expect(screen.getByText("Headshots %")).toBeInTheDocument();
    expect(screen.getByText("10,0%")).toBeInTheDocument();
    expect(screen.queryByText("Headshots", { exact: true })).not.toBeInTheDocument();
  });

  it("explains the missing progression chart instead of showing an empty frame", async () => {
    // A blank plot reads as a bug — the same mistake the panel's "Aguardando 1ª
    // leitura" label fixed. Two readings are the minimum for a line to exist.
    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));
    expect(screen.getByText("Progressão")).toBeInTheDocument();
    expect(screen.getByText("Sem histórico suficiente ainda")).toBeInTheDocument();
    expect(screen.getByText(/a partir da segunda leitura/)).toBeInTheDocument();
  });

  it("shows the rank card with a progress bar and no points on its face", async () => {
    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));
    expect(screen.getByText(rankForPoints(13_000).name)).toBeInTheDocument();
    // The bar is named after the NEXT rank, also derived so a recalibration does
    // not need this file edited.
    expect(
      screen.getByRole("progressbar", {
        name: `Progresso para ${rankProgress(13_000).next?.name}`,
      }),
    ).toBeInTheDocument();
    // The numbers only show on hover, inside the hover card.
    expect(screen.queryByText(/13\.000/)).not.toBeInTheDocument();
  });

  it("falls back to the default artwork when there is no best class", async () => {
    const { getMemberProfile } = await import("@/features/clan/lib/queries");
    const base = await (getMemberProfile as unknown as () => Promise<Record<string, unknown>>)();
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
    expect(screen.getByLabelText(/Plataforma: EA · RRRRRRRREST/)).toBeInTheDocument();
  });

  it("crowns the stats the member leads in the clan", async () => {
    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));
    expect(screen.getByLabelText("Líder do clã em Kills")).toBeInTheDocument();
    expect(screen.queryByLabelText("Líder do clã em Partidas")).not.toBeInTheDocument();
  });
});
