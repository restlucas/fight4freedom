import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, render, screen } from "@/test-utils";

import { RankingCountdown } from "./ranking-countdown";

const NOW = new Date("2026-07-24T00:00:00.000Z");

function endsIn(ms: number): string {
  return new Date(NOW.getTime() + ms).toISOString();
}

describe("RankingCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts down in real time, one second at a time", () => {
    render(<RankingCountdown endsAt={endsIn(2 * 3600_000 + 30 * 60_000 + 10_000)} />);

    const timer = screen.getByRole("timer");
    expect(timer).toHaveAccessibleName("Encerra em 02h 30m 10s");
    expect(screen.getByText("10")).toBeInTheDocument(); // seconds

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(timer).toHaveAccessibleName("Encerra em 02h 30m 09s");
    expect(screen.getByText("09")).toBeInTheDocument();
  });

  it("shows the days unit only when there is at least one day left", () => {
    const { unmount } = render(<RankingCountdown endsAt={endsIn(3 * 86_400_000)} />);
    expect(screen.getByText("d")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    unmount();

    render(<RankingCountdown endsAt={endsIn(5 * 60_000)} />);
    expect(screen.queryByText("d")).not.toBeInTheDocument();
  });

  it("reports a finished season", () => {
    render(<RankingCountdown endsAt={endsIn(-1000)} />);
    expect(screen.getByText("Encerrado")).toBeInTheDocument();
  });
});
