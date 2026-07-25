import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/clan/lib/queries", () => ({
  getMedalsCatalog: vi.fn().mockResolvedValue([
    {
      id: "md1",
      name: "Clutch King",
      description: "Virou um round perdido sozinho, sem munição.",
      criteria: "Vencer um 1vX (X >= 3)",
      tier: "legendary",
      icon: "crown",
      imageUrl: null,
      holders: [{ id: "m1", nickname: "RRRRRRRREST", avatarUrl: null }],
    },
    {
      id: "md2",
      name: "Anchor",
      description: "Segurou o objetivo na hora decisiva.",
      criteria: "Maior pontuação de objetivo em 5 vitórias",
      tier: "rare",
      icon: "shield",
      imageUrl: null,
      holders: [],
    },
  ]),
}));

import MedalhasPage from "./page";

describe("MedalhasPage", () => {
  it("renders a card per medal with its criteria and holders", async () => {
    render(await MedalhasPage());

    expect(
      screen.getByRole("heading", { level: 1, name: /medalhas/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Clutch King")).toBeInTheDocument();
    expect(screen.getByText("Anchor")).toBeInTheDocument();
    expect(screen.getByText(/vencer um 1vx/i)).toBeInTheDocument();
    expect(screen.getByText("1 conquistou")).toBeInTheDocument();
    expect(screen.getByText(/ninguém conquistou ainda/i)).toBeInTheDocument();
  });

  it("filters by name", async () => {
    const user = userEvent.setup();
    render(await MedalhasPage());

    await user.type(screen.getByRole("searchbox"), "anchor");

    expect(screen.getByText("Anchor")).toBeInTheDocument();
    expect(screen.queryByText("Clutch King")).not.toBeInTheDocument();
  });

  it("filters by description, ignoring accents", async () => {
    const user = userEvent.setup();
    render(await MedalhasPage());

    // "decisiva" only appears in Anchor's description.
    await user.type(screen.getByRole("searchbox"), "hora decisiva");

    expect(screen.getByText("Anchor")).toBeInTheDocument();
    expect(screen.queryByText("Clutch King")).not.toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox"));
    // "municao" without the accent still matches "munição".
    await user.type(screen.getByRole("searchbox"), "municao");

    expect(screen.getByText("Clutch King")).toBeInTheDocument();
    expect(screen.queryByText("Anchor")).not.toBeInTheDocument();
  });
});
