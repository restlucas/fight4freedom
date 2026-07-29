import { describe, expect, it } from "vitest";

import { POINTS_PER_HOUR, RANKS, TOP_RANK } from "@/lib/ranks";

import { MIN_MEASURED_HOURS, rankForecast } from "./forecast";
import type { ProgressionPoint } from "./progression";

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

describe("rankForecast", () => {
  it("returns null at the top of the ladder, where there is nothing to forecast", () => {
    expect(rankForecast(TOP_RANK.threshold, [])).toBeNull();
  });

  it("names the next rank and what is missing for it", () => {
    const forecast = rankForecast(CABO.threshold - 150, []);

    expect(forecast?.next.name).toBe("Cabo");
    expect(forecast?.pointsToNext).toBe(150);
  });

  it("falls back to the clan calibration when the member has no history", () => {
    const forecast = rankForecast(0, []);

    expect(forecast?.basis).toBe("clan");
    expect(forecast?.rate).toBe(POINTS_PER_HOUR);
    expect(forecast?.hoursToNext).toBeCloseTo(CABO.threshold / POINTS_PER_HOUR, 5);
  });

  it("uses the member's own pace once there is enough of it", () => {
    // 600 points over 3 hours = 200 pts/h, above the clan's 150.
    const forecast = rankForecast(CABO.threshold - 600, [point(0, 0), point(3, 600)]);

    expect(forecast?.basis).toBe("member");
    expect(forecast?.rate).toBeCloseTo(200, 5);
    expect(forecast?.hoursToNext).toBeCloseTo(3, 5);
  });

  it("measures points and hours over the SAME window", () => {
    // The trap this pins: the series' hours are CAREER hours, so a long-standing
    // member starts at 700 h. Dividing collected points by career hours would put
    // every veteran's rate near zero and forecast decades.
    const forecast = rankForecast(1_000, [point(700, 0), point(702, 400)]);

    expect(forecast?.rate).toBeCloseTo(200, 5);
  });

  it("ignores a sample thinner than the minimum", () => {
    const forecast = rankForecast(0, [point(0, 0), point(MIN_MEASURED_HOURS / 2, 300)]);

    expect(forecast?.basis).toBe("clan");
  });

  it("ignores a window with no points gained, instead of dividing by zero", () => {
    // A member read across two days who did not play: hours moved, points did not.
    const forecast = rankForecast(0, [point(0, 500), point(4, 500)]);

    expect(forecast?.basis).toBe("clan");
    expect(Number.isFinite(forecast!.hoursToNext)).toBe(true);
  });

  it("needs two readings before it claims to know a pace", () => {
    expect(rankForecast(0, [point(10, 300)])?.basis).toBe("clan");
  });
});
