import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/clan/lib/queries", () => ({
  getMemberProfile: vi.fn().mockResolvedValue({
    id: "m1",
    nickname: "RRRRRRRREST",
    platform: "ea",
    role: "admin",
    avatarUrl: null,
    joinedAt: new Date("2025-10-01T00:00:00Z"),
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
        tier: "gold",
        icon: "crosshair",
        criteria: "20 kills without dying",
        description: null,
        awardedAt: new Date("2026-07-01T00:00:00Z"),
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
});
