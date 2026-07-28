import { describe, expect, it } from "vitest";

import { FIRST_RANK, insigniaPath, rankForPoints, rankProgress, RANKS, TOP_RANK } from "./ranks";

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

  it("starts at zero and the first promotion costs 30 points", () => {
    expect(FIRST_RANK.threshold).toBe(0);
    expect(RANKS[1].name).toBe("Cabo");
    expect(RANKS[1].threshold).toBe(30);
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
    expect(rankForPoints(29).name).toBe("Soldado");
  });

  it("promotes exactly at the threshold", () => {
    expect(rankForPoints(30).name).toBe("Cabo");
    expect(rankForPoints(89).name).toBe("Cabo");
    expect(rankForPoints(90).name).toBe("Terceiro-Sargento");
  });

  it("caps at the top rank", () => {
    expect(rankForPoints(20_000).name).toBe("Marechal");
    expect(rankForPoints(999_999)).toEqual(TOP_RANK);
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
    // Soldado spans 0..30; 15 points is halfway to Cabo.
    const progress = rankProgress(15);
    expect(progress.rank.name).toBe("Soldado");
    expect(progress.next?.name).toBe("Cabo");
    expect(progress.pointsIntoRank).toBe(15);
    expect(progress.rankSpan).toBe(30);
    expect(progress.pointsToNext).toBe(15);
    expect(progress.fraction).toBeCloseTo(0.5);
  });

  it("resets the bar right after a promotion", () => {
    const progress = rankProgress(30);
    expect(progress.rank.name).toBe("Cabo");
    expect(progress.pointsIntoRank).toBe(0);
    expect(progress.fraction).toBe(0);
  });

  it("never emits NaN for invalid points", () => {
    const progress = rankProgress(NaN);
    expect(progress.pointsIntoRank).toBe(0);
    expect(progress.fraction).toBe(0);
    expect(progress.pointsToNext).toBe(30);
  });

  it("reports a full bar and no next rank at the top", () => {
    const progress = rankProgress(25_000);
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
