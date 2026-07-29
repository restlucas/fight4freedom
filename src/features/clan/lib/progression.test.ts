import { describe, expect, it } from "vitest";

import { emptyTotals, type StatTotals } from "@/lib/stats/snapshots";

import { buildProgression } from "./progression";

function snapshot(
  capturedAt: string,
  partial: Partial<StatTotals>,
  eaNucleusId: string | null = "conta-1",
) {
  return { capturedAt: new Date(capturedAt), eaNucleusId, ...emptyTotals(), ...partial };
}

describe("buildProgression", () => {
  it("returns one point per snapshot, oldest first", () => {
    const series = buildProgression([
      snapshot("2026-07-28T10:00:00Z", { kills: 200, deaths: 100, wins: 12, losses: 8 }),
      snapshot("2026-07-27T10:00:00Z", { kills: 100, deaths: 50, wins: 6, losses: 4 }),
    ]);

    expect(series).toHaveLength(2);
    expect(series[0].capturedAt).toBe("2026-07-27T10:00:00.000Z");
    expect(series[0].kills).toBe(100);
    expect(series[1].kills).toBe(200);
  });

  it("sorts, because the accumulation is order-dependent", () => {
    // Handed the readings backwards, the points would otherwise accumulate a
    // negative-going delta and the chart would zigzag.
    const ordered = buildProgression([
      snapshot("2026-07-27T10:00:00Z", { kills: 100 }),
      snapshot("2026-07-28T10:00:00Z", { kills: 200 }),
    ]);
    const shuffled = buildProgression([
      snapshot("2026-07-28T10:00:00Z", { kills: 200 }),
      snapshot("2026-07-27T10:00:00Z", { kills: 100 }),
    ]);

    expect(shuffled).toEqual(ordered);
  });

  it("starts points at zero and accumulates only measured progress", () => {
    // The first reading credits nothing — those totals were earned before we were
    // watching. 30 wins is what the second reading adds.
    const series = buildProgression([
      snapshot("2026-07-27T10:00:00Z", { wins: 100 }),
      snapshot("2026-07-28T10:00:00Z", { wins: 101 }),
    ]);

    expect(series[0].points).toBe(0);
    expect(series[1].points).toBe(25); // one win, weight 25
  });

  it("keeps the running total monotonic across many readings", () => {
    const series = buildProgression([
      snapshot("2026-07-27T10:00:00Z", { wins: 10 }),
      snapshot("2026-07-27T12:00:00Z", { wins: 11 }),
      snapshot("2026-07-28T10:00:00Z", { wins: 13 }),
    ]);

    expect(series.map((p) => p.points)).toEqual([0, 25, 75]);
  });

  it("adds nothing across a rebind, so a wrong binding cannot spike the curve", () => {
    // Lifetime counters of two accounts: the difference is a stranger's career.
    const series = buildProgression([
      snapshot("2026-07-27T10:00:00Z", { wins: 10 }, "conta-antiga"),
      snapshot("2026-07-28T10:00:00Z", { wins: 400 }, "conta-propria"),
    ]);

    expect(series.map((p) => p.points)).toEqual([0, 0]);
  });

  it("derives kd, matches and hours from each reading's totals", () => {
    const series = buildProgression([
      snapshot("2026-07-27T10:00:00Z", {
        kills: 150,
        deaths: 50,
        wins: 12,
        losses: 8,
        timePlayedMinutes: 90,
      }),
    ]);

    expect(series[0].kd).toBe(3);
    expect(series[0].matches).toBe(20);
    expect(series[0].hours).toBe(1.5);
  });

  it("returns an empty series for a member with no snapshots", () => {
    expect(buildProgression([])).toEqual([]);
  });
});
