import { describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test-utils";

vi.mock("@/features/clan/lib/queries", () => ({
  getClanStats: vi.fn().mockResolvedValue({
    totalMembers: 1,
    totalMedalsAwarded: 2,
    averageKd: 2,
    averageWinRate: 0.6,
  }),
  getMedalsCatalog: vi.fn().mockResolvedValue([
    {
      id: "md1",
      name: "Clutch King",
      description: "Virou um round perdido sozinho.",
      criteria: "Vencer um clutch 1vX",
      tier: "legendary",
      icon: "crown",
      imageUrl: null,
      holders: [{ id: "m1", nickname: "RRRRRRRREST", avatarUrl: null }],
    },
    {
      id: "md2",
      name: "Anchor",
      description: "Segurou o objetivo.",
      criteria: "Maior pontuação de objetivo",
      tier: "rare",
      icon: "shield",
      imageUrl: null,
      holders: [],
    },
  ]),
}));

import Home from "./page";

describe("Home", () => {
  it("renders the hero and the join CTA", async () => {
    render(await Home());
    expect(screen.getByRole("heading", { name: /fight 4 freedom/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /quero ser membro/i })).toBeInTheDocument();
  });

  it("shows the medals and stats sections", async () => {
    render(await Home());
    expect(screen.getByRole("heading", { name: /sistema de medalhas/i })).toBeInTheDocument();
    expect(screen.getByText(/membros ativos/i)).toBeInTheDocument();
  });

  it("shows real medals in a navigable carousel", async () => {
    render(await Home());
    expect(screen.getByText("Clutch King")).toBeInTheDocument();
    expect(screen.getByText("Anchor")).toBeInTheDocument();
    // The old hardcoded tier cards are gone.
    expect(screen.queryByText("Bronze")).not.toBeInTheDocument();
    expect(screen.queryByText("Prata")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous slide/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next slide/i })).toBeInTheDocument();
  });
});
