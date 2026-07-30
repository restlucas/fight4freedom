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

describe("PlayerStats hover", () => {
  it("keeps a leader's yellow border on hover instead of greying it out", () => {
    // The regression this guards: a shared `hover:border-muted-foreground/30` outranks
    // the base yellow at runtime, so the crown's border would disappear on the one
    // interaction most likely to happen over it.
    render(<PlayerStats stats={stats} bestClass="assault" leadsIn={["kills"]} />);

    const crown = screen.getByLabelText("Líder do clã em Kills");
    const tile = crown.closest("div.bg-secondary\\/80");
    expect(tile?.className).toContain("border-yellow-500/50");
    expect(tile?.className).toContain("hover:border-yellow-500/80");
    expect(tile?.className).not.toContain("hover:border-muted-foreground");
  });

  it("gives an ordinary tile the neutral hover", () => {
    render(<PlayerStats stats={stats} bestClass="assault" />);

    const tile = screen.getByText("Deaths").closest("div.bg-secondary\\/80");
    expect(tile?.className).toContain("hover:border-muted-foreground/30");
    expect(tile?.className).toContain("hover:bg-secondary");
  });
});

describe("PlayerStats game tiles", () => {
  const game = {
    badgeCount: 104,
    dogTagCount: 39,
    competitiveRankName: null,
    competitiveRankMode: null,
    xpTotal: 10_308_364,
  };

  it("does not render the game tiles at all when no game data is passed", () => {
    // The component still serves surfaces that do not collect these.
    render(<PlayerStats stats={stats} bestClass="assault" />);
    expect(screen.queryByText("Insígnias")).not.toBeInTheDocument();
    expect(screen.queryByText("Dog tags")).not.toBeInTheDocument();
    expect(screen.queryByText("XP total")).not.toBeInTheDocument();
  });

  it("shows the collectable counts and a compact XP", () => {
    render(<PlayerStats stats={stats} bestClass="assault" game={game} />);

    expect(screen.getByText("Insígnias")).toBeInTheDocument();
    expect(screen.getByText("104")).toBeInTheDocument();
    expect(screen.getByText("Dog tags")).toBeInTheDocument();
    expect(screen.getByText("39")).toBeInTheDocument();
    // Compact because the exact figure is 10 monospaced characters and the tile
    // fits about 8. XP is a magnitude nobody checks digit by digit.
    expect(screen.getByText("XP total")).toBeInTheDocument();
    expect(screen.getByText("10,3 mi")).toBeInTheDocument();
  });

  it("shows a dash for counts not collected yet, rather than hiding the tile", () => {
    // The pass reads 10 members per cycle, so a new member's tiles fill in within
    // hours. A tile that disappears and comes back would read as a bug.
    render(
      <PlayerStats
        stats={stats}
        bestClass="assault"
        game={{ ...game, badgeCount: null, dogTagCount: null, xpTotal: 0 }}
      />,
    );

    expect(screen.getByText("Insígnias")).toBeInTheDocument();
    expect(screen.getByText("Dog tags")).toBeInTheDocument();
    expect(screen.getByText("XP total")).toBeInTheDocument();
    // Zero XP means the snapshot predates the column, not an account with no XP.
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("hides the ranked tile entirely when there is no division", () => {
    // Unlike the counters above. The source answers "Unranked" for most of the
    // roster and the collector stores that as null, so a permanent tile would be a
    // dash on nearly every profile.
    render(<PlayerStats stats={stats} bestClass="assault" game={game} />);
    expect(screen.queryByText(/^Ranked/)).not.toBeInTheDocument();
  });

  it("shows the ranked tile, named after the mode, when there is a division", () => {
    render(
      <PlayerStats
        stats={stats}
        bestClass="assault"
        game={{ ...game, competitiveRankName: "Ouro III", competitiveRankMode: "Redsec Duos" }}
      />,
    );

    expect(screen.getByText("Ranked Redsec Duos")).toBeInTheDocument();
    expect(screen.getByText("Ouro III")).toBeInTheDocument();
  });

  it("falls back to a bare Ranked label when the mode is missing", () => {
    render(
      <PlayerStats
        stats={stats}
        bestClass="assault"
        game={{ ...game, competitiveRankName: "Ouro III", competitiveRankMode: null }}
      />,
    );

    expect(screen.getByText("Ranked")).toBeInTheDocument();
  });
});
