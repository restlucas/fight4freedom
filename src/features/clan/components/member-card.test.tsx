import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MemberOverview } from "../lib/queries";
import { MemberCard } from "./member-card";

const member: MemberOverview = {
  id: "m1",
  nickname: "RRRRRRRREST",
  platform: "ea",
  role: "admin",
  avatarUrl: null,
  medalCount: 2,
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

  it("shows the platform badge (not the role) and the compact stats", () => {
    render(<MemberCard member={member} />);
    expect(screen.getByText("EA")).toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    expect(screen.getByText("K/D")).toBeInTheDocument();
    expect(screen.getByText("2.00")).toBeInTheDocument(); // K/D = 200/100
    expect(screen.getByText("Partidas")).toBeInTheDocument();
    expect(screen.getByText("Horas")).toBeInTheDocument();
  });
});
