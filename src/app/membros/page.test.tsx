import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/clan/lib/queries", () => ({
  getMembersOverview: vi.fn().mockResolvedValue([
    {
      id: "m1",
      nickname: "RRRRRRRREST",
      platform: "ea",
      role: "admin",
      avatarUrl: null,
      medalCount: 2,
      totals: {
        kills: 100,
        deaths: 50,
        matchesPlayed: 30,
        wins: 15,
        score: 1000,
        timePlayedMinutes: 600,
      },
      kd: 2,
      winRate: 0.5,
    },
  ]),
}));

import MembersPage from "./page";

describe("MembersPage", () => {
  it("renders the heading and a card per member", async () => {
    render(await MembersPage());
    expect(
      screen.getByRole("heading", { name: /membros/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("RRRRRRRREST")).toBeInTheDocument();
  });
});
