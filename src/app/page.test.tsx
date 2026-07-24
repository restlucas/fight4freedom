import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/clan/lib/queries", () => ({
  getClanStats: vi.fn().mockResolvedValue({
    totalMembers: 1,
    totalMedalsAwarded: 2,
    averageKd: 2,
    averageWinRate: 0.6,
  }),
}));

import Home from "./page";

describe("Home", () => {
  it("renders the hero and the join CTA", async () => {
    render(await Home());
    expect(
      screen.getByRole("heading", { name: /fight 4 freedom/i, level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /quero ser membro/i }),
    ).toBeInTheDocument();
  });

  it("shows the medals and stats sections", async () => {
    render(await Home());
    expect(
      screen.getByRole("heading", { name: /sistema de medalhas/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/membros ativos/i)).toBeInTheDocument();
  });
});
