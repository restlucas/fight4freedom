import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { render, screen } from "@/test-utils";

import type { MemberOverview } from "../lib/queries";
import { MemberCard } from "./member-card";

const member: MemberOverview = {
  id: "m1",
  nickname: "RRRRRRRREST",
  platform: "ea",
  role: "admin",
  platformId: "RRRRRRRREST",
  avatarUrl: null,
  rankPoints: 13_000, // General de Divisão
  medalCount: 7,
  medals: [
    { id: "md1", name: "Clutch King", tier: "legendary", icon: "crown", imageUrl: null },
    { id: "md2", name: "Anchor", tier: "rare", icon: "shield", imageUrl: null },
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
};

describe("MemberCard", () => {
  it("shows the nickname and links to the profile", () => {
    render(<MemberCard member={member} />);
    expect(screen.getByText("RRRRRRRREST")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/membros/m1");
  });

  it("shows the platform mark with its id (not the role) and the compact stats", () => {
    render(<MemberCard member={member} />);
    expect(
      screen.getByLabelText(/Plataforma: EA · RRRRRRRREST/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    expect(screen.getByText("K/D")).toBeInTheDocument();
    expect(screen.getByText("2.00")).toBeInTheDocument(); // K/D = 200/100
    expect(screen.getByText("Partidas")).toBeInTheDocument();
    expect(screen.getByText("Horas")).toBeInTheDocument();
  });

  it("stacks the latest medals and collapses the rest into +N", () => {
    render(<MemberCard member={member} />);
    expect(screen.getByRole("group", { name: "7 medalhas" })).toBeInTheDocument();
    expect(screen.getByTitle("Clutch King")).toBeInTheDocument();
    expect(screen.getByTitle("Anchor")).toBeInTheDocument();
    // 7 earned, 2 previewed.
    expect(screen.getByText("+5")).toBeInTheDocument();
  });

  it("shows no medal group for a member without medals", () => {
    render(<MemberCard member={{ ...member, medalCount: 0, medals: [] }} />);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("copies the platform id on click, without following the card link", async () => {
    const user = userEvent.setup();
    render(<MemberCard member={member} />);

    await user.click(screen.getByRole("button", { name: /copiar o id/i }));

    expect(await navigator.clipboard.readText()).toBe("RRRRRRRREST");
    // The click was swallowed, so the surrounding link never navigated.
    expect(window.location.pathname).not.toBe("/membros/m1");
  });

  it("shows the rank insignia derived from the points", () => {
    render(<MemberCard member={member} />);
    expect(
      screen.getByLabelText("Patente: General de Divisão · 13.000 pts"),
    ).toBeInTheDocument();
  });

  it("reveals the rank name and points in a tooltip on hover", async () => {
    const user = userEvent.setup();
    render(<MemberCard member={member} />);

    await user.hover(
      screen.getByLabelText("Patente: General de Divisão · 13.000 pts"),
    );

    // Radix renders the content in a portal, plus a visually hidden copy.
    const tooltips = await screen.findAllByText("General de Divisão");
    expect(tooltips.length).toBeGreaterThan(0);
    expect(screen.getAllByText("13.000 pts").length).toBeGreaterThan(0);
  });

  it("crowns only the stats the member leads", () => {
    render(
      <MemberCard
        member={member}
        leaders={{ kd: ["m1"], kills: [], matches: [], hours: [] }}
      />,
    );
    expect(screen.getByLabelText("Líder em K/D")).toBeInTheDocument();
    expect(screen.queryByLabelText("Líder em Kills")).not.toBeInTheDocument();
  });
});
