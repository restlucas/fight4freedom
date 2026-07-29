import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { emptyTotals, type StatTotals } from "@/lib/stats/snapshots";
import { PlayerStats } from "./player-stats";

const stats: StatTotals = {
  ...emptyTotals(),
  kills: 200,
  deaths: 100,
  wins: 12,
  losses: 8,
  assists: 50,
  revives: 30,
  headshots: 40,
  objectivesCaptured: 15,
  timePlayedMinutes: 120,
};

describe("PlayerStats", () => {
  it("shows raw counters and derived values", () => {
    render(<PlayerStats stats={stats} bestClass="assault" />);
    expect(screen.getByText("Kills")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument(); // kills
    expect(screen.getByText("Partidas")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument(); // matches = 12 + 8
    expect(screen.getByText("10.0")).toBeInTheDocument(); // kills/match = 200/20
    expect(screen.getByText("2 h")).toBeInTheDocument(); // 120 min
    expect(screen.getByText("Assalto")).toBeInTheDocument(); // best class
  });

  it("shows the headshot rate as a percentage when the denominator exists", () => {
    render(<PlayerStats stats={stats} bestClass="assault" headshotRate={0.118} />);
    expect(screen.getByText("Headshots %")).toBeInTheDocument();
    expect(screen.getByText("11,8%")).toBeInTheDocument();
    // One decimal, not a whole number: real rates cluster between 10 and 20 %, and
    // rounding would make most of the roster look identical.
    expect(screen.queryByText("12%")).not.toBeInTheDocument();
  });

  it("falls back to the absolute count when there is no rate to show", () => {
    // Snapshots written before `allModeKills` was recorded have no honest
    // denominator, and an absolute count is better than a wrong percentage.
    render(<PlayerStats stats={stats} bestClass="assault" headshotRate={null} />);
    expect(screen.getByText("Headshots")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
  });

  it("renders a dash when there is no best class", () => {
    render(<PlayerStats stats={stats} bestClass={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
