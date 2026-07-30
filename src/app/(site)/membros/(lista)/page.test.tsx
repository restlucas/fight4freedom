import { describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test-utils";

vi.mock("@/features/clan/lib/queries", () => ({
  getMembersOverview: vi.fn().mockResolvedValue([
    {
      id: "m1",
      nickname: "RRRRRRRREST",
      platform: "ea",
      role: "admin",
      platformId: "RRRRRRRREST",
      avatarUrl: null,
      rankPoints: 13_000,
      medalCount: 2,
      medals: [
        {
          id: "md1",
          name: "Sharpshooter",
          tier: "legendary",
          icon: "crosshair",
          imageUrl: null,
        },
      ],
      bestClass: "assault",
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
    },
  ]),
}));

import MembersPage from "./page";

describe("MembersPage", () => {
  it("renders the heading and a card per member", async () => {
    render(await MembersPage());
    expect(screen.getByRole("heading", { name: /membros/i })).toBeInTheDocument();
    expect(screen.getByText("RRRRRRRREST")).toBeInTheDocument();
  });
});
