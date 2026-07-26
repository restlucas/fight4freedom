import { describe, expect, it } from "vitest";

import { chunk, parsePlayersPayload, toRawStats } from "./gametools";
import { gametoolsPlayerFixture } from "./gametools.fixture";

describe("parsePlayersPayload", () => {
  it("unwraps the { data: [...] } envelope (2+ players)", () => {
    const players = parsePlayersPayload({
      data: [gametoolsPlayerFixture, gametoolsPlayerFixture],
    });
    expect(players).toHaveLength(2);
    expect(players[0].id).toBe("1111751848");
  });

  it("accepts the bare object the API returns for a single player", () => {
    const players = parsePlayersPayload(gametoolsPlayerFixture);
    expect(players).toHaveLength(1);
    expect(players[0].userId).toBe("1000707516734");
  });

  it("coerces numeric ids to strings", () => {
    const players = parsePlayersPayload({
      ...gametoolsPlayerFixture,
      id: 1111751848,
      userId: 1000707516734,
    });
    expect(players[0].id).toBe("1111751848");
    expect(players[0].userId).toBe("1000707516734");
  });

  it("rejects a payload without player ids", () => {
    expect(() => parsePlayersPayload({ errors: ["Player not found"] })).toThrow();
  });
});

describe("toRawStats", () => {
  const player = parsePlayersPayload(gametoolsPlayerFixture)[0];

  it("reads the gm_all bucket, never the top-level aggregate", () => {
    const raw = toRawStats(player);
    expect(raw).not.toBeNull();
    // The fixture's top-level says kills: 13695 (class bucket). The canonical
    // value is the gm_all scoreboard total — docs/api-gametools.md §10.
    expect(raw!.kills).toBe(17587);
    expect(raw!.deaths).toBe(4955);
    expect(raw!.wins).toBe(268);
    expect(raw!.losses).toBe(244);
    expect(raw!.assists).toBe(6080);
    expect(raw!.revives).toBe(3451);
    expect(raw!.headshots).toBe(2874);
    expect(raw!.objectivesCaptured).toBe(1152);
    expect(raw!.matches).toBe(512);
    expect(raw!.secondsPlayed).toBe(745_876);
    expect(raw!.timePlayedMinutes).toBe(Math.round(745_876 / 60));
  });

  it("echoes the identity so batch results map back to members", () => {
    const raw = toRawStats(player)!;
    expect(raw.personaId).toBe("1111751848");
    expect(raw.nucleusId).toBe("1000707516734");
  });

  it("derives bestClass from classes[], ignoring the 'All' row", () => {
    const raw = toRawStats(player)!;
    expect(raw.bestClass).toBe("support");
  });

  it("keeps the tracker.gg-visible number and coherent averages in extra", () => {
    const raw = toRawStats(player)!;
    expect(raw.extra.humanKills).toBe(12_320);
    expect(raw.extra.killDeath).toBe(3.55);
    expect(raw.extra.winPercent).toBe(52.34);
  });

  it("returns null when there is no gm_all group to trust", () => {
    const withoutGroups = parsePlayersPayload({
      ...gametoolsPlayerFixture,
      gameModeGroups: [],
    })[0];
    expect(toRawStats(withoutGroups)).toBeNull();
  });
});

describe("chunk", () => {
  it("splits into consecutive slices of at most size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns a single slice when under the size", () => {
    expect(chunk([1], 10)).toEqual([[1]]);
  });

  it("handles an empty list", () => {
    expect(chunk([], 10)).toEqual([]);
  });
});
