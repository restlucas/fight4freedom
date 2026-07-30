import { describe, expect, it } from "vitest";

import { filterBoard, RANKING_HISTORY_LIMIT, visibleBoard } from "./ranking";
import type { RankingEntry } from "./queries";

function entry(rank: number, nickname: string): RankingEntry {
  return {
    rank,
    memberId: `m${rank}`,
    nickname,
    avatarUrl: null,
    platform: "ea",
    points: 1000 - rank,
    previousRank: null,
    progress: { kills: 10, matches: 5, kd: 1.2, timePlayedMinutes: 60 },
  };
}

const BOARD = [entry(1, "GERERÊ"), entry(2, "ApodiOLoko"), entry(3, "Sicario_of_Souls")];

describe("visibleBoard", () => {
  it("leaves an open season whole", () => {
    const board = Array.from({ length: 40 }, (_, i) => entry(i + 1, `Membro${i + 1}`));
    expect(visibleBoard(board, true)).toHaveLength(40);
  });

  it("caps a closed season at its podium", () => {
    const board = Array.from({ length: 40 }, (_, i) => entry(i + 1, `Membro${i + 1}`));
    expect(visibleBoard(board, false)).toHaveLength(RANKING_HISTORY_LIMIT);
  });
});

describe("filterBoard", () => {
  it("returns the whole board for an empty search", () => {
    expect(filterBoard(BOARD, "   ")).toBe(BOARD);
  });

  it("matches regardless of case and accents", () => {
    expect(filterBoard(BOARD, "gerere").map((e) => e.nickname)).toEqual(["GERERÊ"]);
    expect(filterBoard(BOARD, "APODI").map((e) => e.nickname)).toEqual(["ApodiOLoko"]);
  });

  it("matches on any part of the nickname", () => {
    expect(filterBoard(BOARD, "of_souls").map((e) => e.nickname)).toEqual(["Sicario_of_Souls"]);
  });

  it("keeps each member's rank on the full board instead of renumbering", () => {
    // Searching narrows the list; it is not a board of its own.
    expect(filterBoard(BOARD, "sicario")[0]?.rank).toBe(3);
  });

  it("never repeats a member", () => {
    const ids = filterBoard(BOARD, "o").map((e) => e.memberId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
