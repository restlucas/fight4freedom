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

  it("counts only kills against real players, never the bot-inclusive totals", () => {
    const raw = toRawStats(player);
    expect(raw).not.toBeNull();
    // The fixture carries three kill totals. 17587 is gm_all (all modes, bots
    // included) and 13695 is the class bucket (also bot-inclusive). The canonical
    // one is 12320: humans only — clan decision, docs/api-gametools.md §10.3.
    expect(raw!.kills).toBe(12_320);
    // Deaths come from the class bucket, the one the human count is a subset of.
    // 12320 / 4126 = 2.99, exactly the `infantryKillDeath` the API publishes;
    // pairing with gm_all's 4955 would give 2.49, a ratio it never reports.
    expect(raw!.deaths).toBe(4_126);
  });

  it("reads player-versus-player counters from the class bucket", () => {
    // assists and revives moved here on 2026-07-27 for parity with tracker.gg.
    // gm_all would say 6080 and 3451 — wider scope, not a bot filter.
    const raw = toRawStats(player)!;
    expect(raw.assists).toBe(4_365);
    expect(raw.revives).toBe(3_062);
  });

  it("keeps objective and map-control counters on all modes", () => {
    // These have NO class-bucket equivalent, so gm_all is the only option, and
    // the clan wants them counting every mode anyway.
    const raw = toRawStats(player)!;
    expect(raw.objectivesCaptured).toBe(1152);
    expect(raw.objectivesDefended).toBe(2483);
    expect(raw.objectivesDestroyed).toBe(14);
    expect(raw.objectivesArmed).toBe(25);
    expect(raw.objectivesDisarmed).toBe(9);
    expect(raw.sectorsDefended).toBe(63);
    expect(raw.objectiveTimeSeconds).toBe(105_152);
    expect(raw.spots).toBe(2581);
    expect(raw.healthRestored).toBe(33_015);
    expect(raw.repairs).toBe(6756);
    expect(raw.headshots).toBe(2874);
    expect(raw.wins).toBe(268);
    expect(raw.losses).toBe(244);
    expect(raw.matches).toBe(512);
    expect(raw.secondsPlayed).toBe(745_876);
    expect(raw.timePlayedMinutes).toBe(Math.round(745_876 / 60));
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

  it("parks the totals it does not show in extra, so a member can be answered", () => {
    const raw = toRawStats(player)!;
    // "Why does the site say fewer X than the tracker?" is answerable from the
    // snapshot row alone, without another API call.
    expect(raw.extra.allModeKills).toBe(17_587);
    expect(raw.extra.allModeDeaths).toBe(4_955);
    expect(raw.extra.allModeAssists).toBe(6_080);
    expect(raw.extra.allModeRevives).toBe(3_451);
    // classKills minus kills is the size of the bot filter: 13695 - 12320 = 1375.
    expect(raw.extra.classKills).toBe(13_695);
    expect(Number(raw.extra.classKills) - raw.kills).toBe(1_375);
    // The all-mode ratio is kept but PREFIXED: it is not this member's K/D.
    expect(raw.extra.allModeKillDeath).toBe(3.55);
    expect(raw.extra.winPercent).toBe(52.34);
  });

  it("returns null when the class bucket row is missing", () => {
    // Substituting gm_all would silently widen the scope of two scored counters.
    const noClasses = parsePlayersPayload({
      ...gametoolsPlayerFixture,
      classes: [],
    })[0];
    expect(toRawStats(noClasses)).toBeNull();
  });

  it("rejects class revives larger than the all-mode count", () => {
    const impossible = parsePlayersPayload({
      ...gametoolsPlayerFixture,
      classes: gametoolsPlayerFixture.classes.map((c) =>
        c.className === "All" ? { ...c, revives: 99_999 } : c,
      ),
    })[0];
    expect(toRawStats(impossible)).toBeNull();
  });

  it("returns null when there is no gm_all group to trust", () => {
    const withoutGroups = parsePlayersPayload({
      ...gametoolsPlayerFixture,
      gameModeGroups: [],
    })[0];
    expect(toRawStats(withoutGroups)).toBeNull();
  });

  it("returns null when the payload has no human kill count", () => {
    // Falling back to a bot-inclusive total would put bot kills into a column
    // that promises none, which is worse than skipping the member this cycle.
    const noSplit = parsePlayersPayload({
      ...gametoolsPlayerFixture,
      dividedKills: null,
    })[0];
    expect(toRawStats(noSplit)).toBeNull();
  });

  it("rejects a human count larger than the bucket it belongs to", () => {
    // Humans are a subset of the class bucket, so this can only be corruption.
    const impossible = parsePlayersPayload({
      ...gametoolsPlayerFixture,
      kills: 100,
      dividedKills: { human: 12_320 },
    })[0];
    expect(toRawStats(impossible)).toBeNull();
  });
});

describe("isIncoherentPayload / partially zeroed payloads", () => {
  /** Rebuilds the fixture with gm_all overridden, as the API delivers it. */
  function playerWithBucket(overrides: Record<string, number>) {
    return parsePlayersPayload({
      ...gametoolsPlayerFixture,
      gameModeGroups: gametoolsPlayerFixture.gameModeGroups.map((group) =>
        group.id === "gm_all" ? { ...group, ...overrides } : group,
      ),
    })[0];
  }

  it("discards the exact payload the API served on 2026-07-26 (kills 0, K/D 3.55)", () => {
    // The bogus row that reached production: everything else intact, only
    // gm_all's kills and deaths zeroed. Still fatal even though kills no longer
    // come from gm_all — every teamwork counter does.
    const player = playerWithBucket({ kills: 0, deaths: 0 });
    expect(toRawStats(player)).toBeNull();
  });

  it("discards zeroed kills even when the ratios were zeroed too, if matches were played", () => {
    const player = playerWithBucket({ kills: 0, deaths: 0, killDeath: 0, kpm: 0 });
    // Nobody plays 512 rounds without dying once, so the bucket is broken.
    expect(toRawStats(player)).toBeNull();
  });

  it("accepts a brand-new player with a genuinely empty scoreboard", () => {
    // Coherent zeros must pass, otherwise a member's first session is never
    // recorded. dividedKills has to be zeroed here as well.
    const player = parsePlayersPayload({
      ...gametoolsPlayerFixture,
      dividedKills: { human: 0 },
      gameModeGroups: gametoolsPlayerFixture.gameModeGroups.map((group) =>
        group.id === "gm_all"
          ? {
              ...group,
              kills: 0,
              deaths: 0,
              killDeath: 0,
              kpm: 0,
              matches: 0,
              wins: 0,
              losses: 0,
            }
          : group,
      ),
    })[0];
    const raw = toRawStats(player);
    expect(raw).not.toBeNull();
    expect(raw!.kills).toBe(0);
  });

  it("accepts a first session: zero kills but deaths on the board", () => {
    const player = parsePlayersPayload({
      ...gametoolsPlayerFixture,
      dividedKills: { human: 0 },
      gameModeGroups: gametoolsPlayerFixture.gameModeGroups.map((group) =>
        group.id === "gm_all"
          ? { ...group, kills: 0, deaths: 7, killDeath: 0, kpm: 0, matches: 1 }
          : group,
      ),
    })[0];
    expect(toRawStats(player)).not.toBeNull();
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
