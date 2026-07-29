import { describe, expect, it } from "vitest";

import {
  FIRST_RANK,
  hoursForPoints,
  insigniaPath,
  POINTS_PER_HOUR,
  rankForPoints,
  rankProgress,
  RANKS,
  TOP_RANK,
} from "./ranks";

describe("RANKS", () => {
  it("has 16 ranks, levels in order", () => {
    expect(RANKS).toHaveLength(16);
    expect(RANKS.map((r) => r.level)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
  });

  it("starts at Soldado (no informal 'Recruta') and tops out at Marechal", () => {
    expect(FIRST_RANK.name).toBe("Soldado");
    expect(TOP_RANK.name).toBe("Marechal");
    expect(RANKS.some((r) => r.slug === "recruta")).toBe(false);
  });

  it("starts at zero and the first promotion costs about five hours of play", () => {
    // Deliberately cheap: the only place on the ladder where SPEED matters is
    // the first promotion, so a new member sees movement in a session or two.
    expect(FIRST_RANK.threshold).toBe(0);
    expect(RANKS[1].name).toBe("Cabo");
    expect(hoursForPoints(RANKS[1].threshold)).toBeCloseTo(5, 1);
  });

  it("keeps the top rank out of reach of any career the roster has today", () => {
    // The longest career measured on 2026-07-28 was 814 h. If Marechal cost less
    // than that, the ladder would be finishable by simply having played the game
    // since launch, which is not what the top of an army hierarchy means.
    expect(hoursForPoints(TOP_RANK.threshold)).toBeGreaterThan(1_000);
  });

  it("spaces promotions so two months of heavy play does not finish the ladder", () => {
    // The heaviest member measured played 11 h in two days (~165 h/month). Two
    // months at that pace is 49.500 points, and it has to land mid-ladder — this
    // is the regression that the old 20.000-point top would fail outright.
    const twoMonthsOfOutlier = 165 * 2 * POINTS_PER_HOUR;
    const reached = rankForPoints(twoMonthsOfOutlier);
    expect(reached.level).toBeGreaterThan(6);
    expect(reached.level).toBeLessThan(12);
  });

  it("has strictly increasing thresholds", () => {
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i].threshold).toBeGreaterThan(RANKS[i - 1].threshold);
    }
  });

  it("has unique slugs", () => {
    expect(new Set(RANKS.map((r) => r.slug)).size).toBe(RANKS.length);
  });
});

describe("rankForPoints", () => {
  it("starts everyone as Soldado", () => {
    expect(rankForPoints(0).name).toBe("Soldado");
    expect(rankForPoints(RANKS[1].threshold - 1).name).toBe("Soldado");
  });

  it("promotes exactly at the threshold", () => {
    // Read from RANKS instead of literals: the thresholds are calibration output
    // and move when the weights are retuned, but "promotes AT the threshold, not
    // one point later" is the behaviour under test.
    const cabo = RANKS[1];
    const terceiro = RANKS[2];
    expect(rankForPoints(cabo.threshold).name).toBe("Cabo");
    expect(rankForPoints(terceiro.threshold - 1).name).toBe("Cabo");
    expect(rankForPoints(terceiro.threshold).name).toBe("Terceiro-Sargento");
  });

  it("caps at the top rank", () => {
    expect(rankForPoints(TOP_RANK.threshold).name).toBe("Marechal");
    expect(rankForPoints(TOP_RANK.threshold * 10)).toEqual(TOP_RANK);
  });

  it("treats negative points as zero", () => {
    expect(rankForPoints(-50).name).toBe("Soldado");
  });

  it("survives missing or invalid points from the database", () => {
    expect(rankForPoints(NaN).name).toBe("Soldado");
    expect(rankForPoints(undefined as unknown as number).name).toBe("Soldado");
    expect(rankForPoints(null as unknown as number).name).toBe("Soldado");
  });
});

describe("rankProgress", () => {
  it("measures progress inside the current rank", () => {
    // Halfway from Soldado to Cabo, derived from the ladder so the case survives
    // a recalibration.
    const caboAt = RANKS[1].threshold;
    const halfway = caboAt / 2;
    const progress = rankProgress(halfway);
    expect(progress.rank.name).toBe("Soldado");
    expect(progress.next?.name).toBe("Cabo");
    expect(progress.pointsIntoRank).toBe(halfway);
    expect(progress.rankSpan).toBe(caboAt);
    expect(progress.pointsToNext).toBe(halfway);
    expect(progress.fraction).toBeCloseTo(0.5);
  });

  it("resets the bar right after a promotion", () => {
    const progress = rankProgress(RANKS[1].threshold);
    expect(progress.rank.name).toBe("Cabo");
    expect(progress.pointsIntoRank).toBe(0);
    expect(progress.fraction).toBe(0);
  });

  it("never emits NaN for invalid points", () => {
    const progress = rankProgress(NaN);
    expect(progress.pointsIntoRank).toBe(0);
    expect(progress.fraction).toBe(0);
    expect(progress.pointsToNext).toBe(RANKS[1].threshold);
  });

  it("reports a full bar and no next rank at the top", () => {
    const progress = rankProgress(TOP_RANK.threshold + 5_000);
    expect(progress.rank).toEqual(TOP_RANK);
    expect(progress.next).toBeNull();
    expect(progress.pointsToNext).toBe(0);
    expect(progress.fraction).toBe(1);
  });
});

describe("insigniaPath", () => {
  it("points at the artwork folder", () => {
    expect(insigniaPath(FIRST_RANK)).toBe("/patentes/soldado.webp");
    expect(insigniaPath(TOP_RANK)).toBe("/patentes/marechal.webp");
  });
});
