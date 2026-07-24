import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { StatTotals } from "@/lib/stats/snapshots";
import { PlayerStats } from "./player-stats";

const stats: StatTotals = {
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

  it("renders a dash when there is no best class", () => {
    render(<PlayerStats stats={stats} bestClass={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
