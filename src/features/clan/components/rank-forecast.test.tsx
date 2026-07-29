import { describe, expect, it } from "vitest";

import { RANKS, TOP_RANK } from "@/lib/ranks";
import { render, screen } from "@/test-utils";

import type { ProgressionPoint } from "../lib/progression";
import { RankForecastPanel } from "./rank-forecast";

function point(hours: number, points: number): ProgressionPoint {
  return {
    capturedAt: new Date(2026, 6, 27, 0, Math.round(hours * 60)).toISOString(),
    points,
    kd: 1,
    kills: 0,
    matches: 0,
    hours,
  };
}

const CABO = RANKS[1];

describe("RankForecastPanel", () => {
  it("names the next rank, what is missing and how long it takes", () => {
    render(<RankForecastPanel points={CABO.threshold - 300} series={[]} />);

    expect(screen.getByText(/Próxima patente: Cabo/)).toBeInTheDocument();
    expect(screen.getByText("300")).toBeInTheDocument();
  });

  it("says WHOSE pace the estimate used", () => {
    // A forecast on the clan average is a different claim from one on the
    // member's own week, and a reader who cannot tell them apart cannot judge
    // either.
    render(<RankForecastPanel points={0} series={[]} />);
    expect(screen.getByText(/no ritmo médio do clã/)).toBeInTheDocument();
    expect(screen.getByText(/a média do clã/)).toBeInTheDocument();
  });

  it("switches to the member's own pace once it is measurable", () => {
    render(
      <RankForecastPanel points={CABO.threshold - 400} series={[point(0, 0), point(2, 400)]} />,
    );

    expect(screen.getByText(/no seu ritmo/)).toBeInTheDocument();
    expect(screen.getByText(/medidos nas suas leituras/)).toBeInTheDocument();
  });

  it("exposes the progress as a real progressbar, named after the gap", () => {
    // Named after the gap and not "Progresso para Cabo": the header's rank card
    // already owns that name on this page, and two bars answering to one name is
    // ambiguous for a screen reader.
    render(<RankForecastPanel points={CABO.threshold - 300} series={[]} />);

    expect(
      screen.getByRole("progressbar", { name: "Faltam 300 pontos para Cabo" }),
    ).toBeInTheDocument();
  });

  it("says there is nothing left to chase at the top of the ladder", () => {
    render(<RankForecastPanel points={TOP_RANK.threshold} series={[]} />);

    expect(screen.getByText("Patente máxima do clã")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
