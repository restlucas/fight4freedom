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
};

describe("MemberCard", () => {
  it("shows the nickname and links to the profile", () => {
    render(<MemberCard member={member} />);
    expect(screen.getByText("RRRRRRRREST")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/membros/m1");
  });

  it("renders derived stats, role and platform", () => {
    render(<MemberCard member={member} />);
    expect(screen.getByText("2.00")).toBeInTheDocument(); // K/D
    expect(screen.getByText("50%")).toBeInTheDocument(); // win rate
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("EA")).toBeInTheDocument();
    expect(screen.getByText(/2 medalhas/)).toBeInTheDocument();
  });
});
