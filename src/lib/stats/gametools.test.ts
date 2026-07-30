import { describe, expect, it } from "vitest";

import {
  bestClassByKitTime,
  chunk,
  isEmptyProfile,
  parseCardStats,
  parsePlayersPayload,
  parseProfilePayload,
  pickIdentity,
  pickTopItems,
  profileStat,
  toGameProfile,
  toIdentityCard,
  toRawStats,
} from "./gametools";
import { gametoolsPlayerFixture, gametoolsProfileFixture } from "./gametools.fixture";

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

  it("reads XP out of the one-element array the source uses", () => {
    // Free of charge: the batch payload already carries this. Verified live
    // 2026-07-29 as `XP: [{ total, performance, accolades }]` — an array, which is
    // the part a parser written from memory gets wrong.
    const raw = toRawStats(player)!;
    expect(raw.xpTotal).toBe(10_308_364);
    expect(raw.xpPerformance).toBe(4_007_831);
    expect(raw.xpAccolades).toBe(552_450);
  });

  it("degrades XP to zero instead of losing the member when the block is absent", () => {
    // The ONE tolerant field in a deliberately strict parser. Everything else
    // missing means "skip and retry", because a snapshot with a hole corrupts the
    // month's delta; XP only ever gets displayed, so failing a whole batch over it
    // would trade real data for a cosmetic one.
    const withoutXp = { ...gametoolsPlayerFixture, XP: undefined };
    const raw = toRawStats(parsePlayersPayload(withoutXp)[0])!;
    expect(raw).not.toBeNull();
    expect(raw.xpTotal).toBe(0);
    // The counters that matter are untouched.
    expect(raw.kills).toBe(12_320);
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

describe("isEmptyProfile / account with no BF6 at all", () => {
  const player = parsePlayersPayload(gametoolsPlayerFixture)[0];

  it("flags a response with no game modes, no classes and no time played", () => {
    // The exact shape returned for the four members who had never once been read
    // (verified against the live API on 2026-07-28): the EA account exists, so it
    // comes back in the response, but there is no Battlefield 6 record on it. The
    // cause was the same for all four — `eaName` matched an account that is not
    // theirs — and one was fixed by correcting the name alone.
    const vazio = parsePlayersPayload({
      ...gametoolsPlayerFixture,
      gameModeGroups: [],
      classes: [],
      secondsPlayed: 0,
      dividedKills: null,
    })[0];

    expect(isEmptyProfile(vazio)).toBe(true);
    expect(toRawStats(vazio)).toBeNull();
  });

  it("does NOT flag a genuinely fresh player, who still has the structure", () => {
    // The distinction the predicate lives or dies on. A real player with zero
    // kills gets `gameModeGroups` and the `classes[]` rows, filled with zeros —
    // calling that "wrong account" would accuse an admin of a mistake every time
    // a new member joins before their first match.
    const novato = parsePlayersPayload({
      ...gametoolsPlayerFixture,
      secondsPlayed: 0,
      gameModeGroups: [
        {
          ...gametoolsPlayerFixture.gameModeGroups.find((g: { id: string }) => g.id === "gm_all")!,
          kills: 0,
          deaths: 0,
          matches: 0,
          secondsPlayed: 0,
          killDeath: 0,
          kpm: 0,
          winPercent: 0,
          wins: 0,
          losses: 0,
        },
      ],
    })[0];

    expect(isEmptyProfile(novato)).toBe(false);
  });

  it("does not flag the real fixture", () => {
    expect(isEmptyProfile(player)).toBe(false);
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

describe("pickIdentity", () => {
  // Payloads copied from GET /bf6/player/ on 2026-07-28. Kept verbatim because
  // each one is a case the previous "first case-insensitive hit" rule got wrong
  // or got right only by luck.
  const result = (
    displayName: string,
    personaId: string,
    nucleusId: string,
    username: string,
    platform = "ea",
  ) => ({ displayName, personaId, nucleusId, username, platform });

  it("prefers the case-exact name over one that differs only in case", () => {
    // Willam registered "morpheus98". The old rule bound the first result,
    // a stranger's "Morpheus98" with 242 kills, instead of his 9.949.
    const results = [
      result("Morpheus98", "1004235403320", "1004937803320", "Morpheus98"),
      result("Morpheus98", "1005669298052", "1002716198052", "Morpheus98"),
      result("morpheus98", "1000301196", "1000331359268", "xXMorpheusXx"),
    ];
    const match = pickIdentity(results, "morpheus98");
    expect(match).toEqual({
      status: "resolved",
      identity: {
        personaId: "1000301196",
        nucleusId: "1000331359268",
        username: "xXMorpheusXx",
      },
    });
  });

  it("treats several personas of ONE account as resolved, not ambiguous", () => {
    // Ovaca: four hits, two of them emptied accounts differing only in case.
    // The two case-exact ones share a nucleus id — same account, two platform
    // personas, identical stats — so either is a correct answer.
    const results = [
      result("oVaca", "1004753844667", "1000805144667", "oVaca"),
      result("OVaca", "1003949045742", "1008015745742", "OVaca"),
      result("Ovaca", "1007640405326", "1011812805326", "Ovaca"),
      result("Ovaca", "1005825605326", "1011812805326", "Ovaca"),
    ];
    const match = pickIdentity(results, "Ovaca");
    expect(match.status).toBe("resolved");
    expect(match.status === "resolved" && match.identity.nucleusId).toBe("1011812805326");
  });

  it('falls through to platform "ea" when name AND username both tie', () => {
    // OJUN10R, the only real two-account case in the roster: identical
    // displayName and identical username, so steps 1 and 3 cannot separate them.
    // The `ea` one is the member's — 10.501 kills against 6 on the xboxone one.
    const results = [
      result("OJUN10R", "1840035192", "1004647435766", "OJUN10R", "xboxone"),
      result("OJUN10R", "1841695743", "2843176908", "OJUN10R", "ea"),
    ];
    const match = pickIdentity(results, "OJUN10R", "OJUN10R");
    expect(match).toEqual({
      status: "resolved",
      identity: { personaId: "1841695743", nucleusId: "2843176908", username: "OJUN10R" },
    });
  });

  it("settles wesleyreinan on case alone, never reaching the platform step", () => {
    // Two different people. Neither account has an `ea` persona, so if this
    // reached step 4 there would be nothing to prefer — but case-exact already
    // decided, which is why the missing `ea` never matters here.
    const results = [
      result("wesleyreinan", "1005113496689", "2806096689", "wesleyreinan", "steam"),
      result("WesleyReinan", "1340107518", "1000641923179", "WesleyReinan", "xboxone"),
    ];
    const match = pickIdentity(results, "wesleyreinan", "wesleyreinan");
    expect(match.status).toBe("resolved");
    expect(match.status === "resolved" && match.identity.nucleusId).toBe("2806096689");
  });

  it("ignores a username tiebreak that would eliminate every candidate", () => {
    // A mistyped username must not turn a resolvable member into "not found".
    const results = [
      result("Lucasa", "1", "aaa", "certo", "xboxone"),
      result("Lucasa", "2", "bbb", "tambem", "ea"),
    ];
    const match = pickIdentity(results, "Lucasa", "digitado-errado");
    expect(match.status).toBe("resolved");
    expect(match.status === "resolved" && match.identity.nucleusId).toBe("bbb");
  });

  it("ignores the platform tiebreak when no candidate lives in ea", () => {
    // 19 of 76 accounts have no `ea` persona, so preferring `ea` must never
    // empty the set. Two accounts remain here, so it stays ambiguous.
    const results = [
      result("Xis", "1", "aaa", "um", "steam"),
      result("Xis", "2", "bbb", "dois", "xboxone"),
    ];
    const match = pickIdentity(results, "Xis");
    expect(match.status).toBe("ambiguous");
    expect(match.status === "ambiguous" && match.candidates).toHaveLength(2);
  });

  it("uses the username to separate accounts before platform is consulted", () => {
    const results = [
      result("Lucasa", "1", "aaa", "oopa", "ea"),
      result("Lucasa", "2", "bbb", "Lucasa", "xboxone"),
    ];
    const match = pickIdentity(results, "Lucasa", "Lucasa");
    expect(match.status === "resolved" && match.identity.nucleusId).toBe("bbb");
  });

  it("falls back to a case-insensitive match when nothing matches exactly", () => {
    const results = [result("WENIOBR", "1181356023", "1000887954444", "weniobr")];
    const match = pickIdentity(results, "weniobr");
    expect(match).toEqual({
      status: "resolved",
      identity: { personaId: "1181356023", nucleusId: "1000887954444", username: "weniobr" },
    });
  });

  it("reports not-found for an empty search", () => {
    expect(pickIdentity([], "Kaelnunes")).toEqual({ status: "not-found" });
  });

  it("ignores results that are merely similar — the search is fuzzy", () => {
    const results = [result("xuveroo123", "1", "2", "xuveroo123")];
    expect(pickIdentity(results, "xuveroo")).toEqual({ status: "not-found" });
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

/**
 * Both card fixtures, run through the SAME parsers the provider uses. Parsing
 * rather than casting is the point: it proves the schema accepts the real payload
 * shape, and it is what let the `as const` fixtures stay readonly.
 */
const profileFixture = parseProfilePayload(gametoolsProfileFixture);

describe("profileStat", () => {
  it("reads a value from the flat name/value list", () => {
    expect(profileStat(profileFixture, "matches_level")).toBe(413);
  });

  it("takes the FIRST occurrence of a repeated name, never the sum", () => {
    // The live payload repeats names with identical values; summing 3.713.760
    // twice would report a score nobody has.
    expect(profileStat(profileFixture, "score_total")).toBe(3713760);
  });

  it("treats an entry with no value as unknown, not as zero", () => {
    expect(profileStat(profileFixture, "kill_death_ratio")).toBeNull();
  });

  it("returns null for a name the payload does not carry", () => {
    expect(profileStat(profileFixture, "tp_kit_medic")).toBeNull();
  });

  it("survives a missing profile", () => {
    expect(profileStat(null, "matches_level")).toBeNull();
  });
});

describe("parseProfilePayload tolerance", () => {
  it("accepts an entry with no name, which cost a production cycle", () => {
    // Live failure on 2026-07-29: `stats[338].name` arrived undefined and the strict
    // schema threw away the ENTIRE payload — rank, badges and kit times included —
    // over 1 bad row out of 339. A nameless entry can never match a lookup, so
    // skipping it is free.
    const payload = {
      playerProfiles: [
        {
          rankName: "Colonel I",
          playerCard: { rank: 150, badges: 12 },
          stats: [{ value: 42 }, { name: "score_total", value: 99 }, { name: "tp_kit_recon" }],
        },
      ],
    };

    const profile = parseProfilePayload(payload);
    expect(profileStat(profile, "score_total")).toBe(99);
    // The nameless row is simply invisible, and so is a named one with no value.
    expect(profileStat(profile, "tp_kit_recon")).toBeNull();
    expect(toGameProfile(profile).rankName).toBe("Colonel I");
    expect(toGameProfile(profile).badges).toBe(12);
  });
});

describe("bestClassByKitTime", () => {
  it("picks the class with the most TIME played", () => {
    expect(bestClassByKitTime(profileFixture)).toBe("support");
  });

  it("returns null on a tie instead of whichever key came first", () => {
    const tied = {
      playerProfiles: [
        {
          stats: [
            { name: "tp_kit_assault", value: 5000 },
            { name: "tp_kit_recon", value: 5000 },
          ],
        },
      ],
    };
    expect(bestClassByKitTime(parseProfilePayload(tied))).toBeNull();
  });

  it("ignores kits with zero time, so a fresh account resolves to null", () => {
    const fresh = {
      playerProfiles: [{ stats: [{ name: "tp_kit_assault", value: 0 }] }],
    };
    expect(bestClassByKitTime(parseProfilePayload(fresh))).toBeNull();
  });

  it("survives a missing profile", () => {
    expect(bestClassByKitTime(null)).toBeNull();
  });
});

describe("pickTopItems", () => {
  const player = parsePlayersPayload(gametoolsPlayerFixture)[0];

  it("picks the weapon with the most KILLS, not the most time equipped", () => {
    // A weapon is a choice of tool, and "the one I kill with" is what a member means
    // by their best. The fixture's M433 has 4x the time and a third of the kills, so
    // it is what proves the criterion.
    const weapon = pickTopItems(player).find((item) => item.kind === "weapon")!;
    expect(weapon.name).toBe("L110");
    expect(weapon.kills).toBe(3_412);
    expect(weapon.group).toBe("Machine Guns");
    expect(weapon.metrics).toEqual({ accuracy: 21.91, headshotKills: 502 });
  });

  it("picks the mode and the map by TIME, not by wins", () => {
    // A place is where the member spends evenings. Picking by wins would report
    // whichever they happened to have a good night on: the fixture's Conquest has
    // nearly double Escalation's win rate and 40 % of its time.
    const items = pickTopItems(player);
    const mode = items.find((item) => item.kind === "gamemode")!;
    const map = items.find((item) => item.kind === "map")!;

    expect(mode.name).toBe("Escalation");
    expect(mode.secondsUsed).toBe(52_212);
    expect(map.name).toBe("Siege of Cairo");
    expect(map.secondsUsed).toBe(113_310);
  });

  it('never picks the "All" aggregate row out of maps', () => {
    // `maps[0]` is the aggregate and it always wins a "most played" comparison, so an
    // unfiltered pick would report every member's favourite map as "All" forever, and
    // look perfectly plausible.
    const map = pickTopItems(player).find((item) => item.kind === "map")!;
    expect(map.name).not.toBe("All");
    expect(map.secondsUsed).toBeLessThan(604_766);
  });

  it("never picks a mode roll-up, which is the bug that reached production", () => {
    // The first live cycle (2026-07-29) reported "Official" as the most-played mode
    // for all 68 members it read: `gm_official` is 725.434 s against gm_all's
    // 745.876 s. Filtering the literal name "All" did not catch it, because the
    // source mixes aggregates into its leaf lists under several different names.
    const mode = pickTopItems(player).find((item) => item.kind === "gamemode")!;
    expect(mode.name).toBe("Escalation");
    expect(mode.name).not.toBe("Official");
  });

  it("picks nothing rather than a roll-up when only aggregates are present", () => {
    // The dangerous direction: better no row than a row that says "Official".
    const onlyAggregates = {
      ...gametoolsPlayerFixture,
      gameModes: [{ gamemodeName: "Official", id: "gm_official", secondsPlayed: 725_434 }],
    };
    const kinds = pickTopItems(parsePlayersPayload(onlyAggregates)[0]).map((item) => item.kind);
    expect(kinds).not.toContain("gamemode");
  });

  it("drops mode artwork, because it is SVG", () => {
    // Serving third-party SVG through next/image needs `dangerouslyAllowSVG`. Dropped
    // at the source so nothing downstream is tempted to render it.
    const mode = pickTopItems(player).find((item) => item.kind === "gamemode")!;
    expect(mode.imageUrl).toBeNull();
    // The two kinds that ARE webp keep theirs.
    const map = pickTopItems(player).find((item) => item.kind === "map")!;
    expect(map.imageUrl).toContain(".webp");
  });

  it("returns nothing for a kind whose list is empty", () => {
    // A member who never fired a weapon gets no weapon row, rather than an arbitrary
    // one out of 53 zero-kill ties.
    const noWeapons = { ...gametoolsPlayerFixture, weapons: [] };
    const kinds = pickTopItems(parsePlayersPayload(noWeapons)[0]).map((item) => item.kind);
    expect(kinds).toEqual(["gamemode", "map"]);
  });

  it("refuses a zero score, so an untouched account yields no rows", () => {
    const zeroed = {
      ...gametoolsPlayerFixture,
      weapons: [{ name: "L110", id: "wp_mg_l110", kills: 0, timeEquipped: 0 }],
      gameModes: [{ gamemodeName: "Escalation", id: "gm_esc", secondsPlayed: 0 }],
      maps: [{ name: "Siege of Cairo", id: "lvlmpabbasid", secondsPlayed: 0 }],
    };
    expect(pickTopItems(parsePlayersPayload(zeroed)[0])).toEqual([]);
  });

  it("survives a payload with no item arrays at all", () => {
    // Tolerant for the same reason XP is: these cost a panel row, never a batch of
    // snapshots.
    const bare = {
      ...gametoolsPlayerFixture,
      weapons: undefined,
      gameModes: undefined,
      maps: undefined,
    };
    const raw = toRawStats(parsePlayersPayload(bare)[0])!;
    expect(raw.topItems).toEqual([]);
    // The counters that matter are untouched.
    expect(raw.kills).toBe(12_320);
  });
});

describe("toGameProfile", () => {
  it("reads the rank, the insignia and both collectable counts", () => {
    const game = toGameProfile(profileFixture);

    expect(game.rankName).toBe("Second Lieutenant V");
    expect(game.rankLevel).toBe(141);
    expect(game.rankImageUrl).toBe("https://cdn.gametools.network/ranks/bf6/t_ui_rank_140_sm.png");
    expect(game.badges).toBe(104);
    expect(game.dogTags).toBe(39);
  });

  it("drops an Unranked division instead of storing it", () => {
    // The fixture's real value. Most of the roster answers this, and a stored
    // "Unranked" would put a meaningless tile on nearly every profile. Null here
    // means "no division"; whether we ever asked is `member.gameProfileReadAt`.
    expect(toGameProfile(profileFixture).competitive).toBeNull();
  });

  it("keeps a real division, with the mode it was earned in", () => {
    const ranked = {
      playerProfiles: [
        {
          rankName: "Colonel I",
          competitiveRanks: [
            { modeName: "Redsec Quads", rankName: "Unranked" },
            { modeName: "Redsec Duos", rankName: "Ouro III" },
          ],
          stats: [],
        },
      ],
    };

    // The first entry that is an actual division, so an unranked mode listed ahead
    // of a ranked one does not hide it.
    expect(toGameProfile(parseProfilePayload(ranked)).competitive).toEqual({
      mode: "Redsec Duos",
      rankName: "Ouro III",
    });
  });

  it("treats casing and padding around Unranked as unranked", () => {
    const messy = {
      playerProfiles: [
        { competitiveRanks: [{ modeName: "Redsec Quads", rankName: " UNRANKED " }], stats: [] },
      ],
    };
    expect(toGameProfile(parseProfilePayload(messy)).competitive).toBeNull();
  });

  it("is all nulls for a payload with no profile, never a throw", () => {
    // The collector writes these fields only when the call succeeded, so this
    // shape must be safe to build and safe to discard.
    const game = toGameProfile(null);
    expect(game).toEqual({
      rankName: null,
      rankLevel: null,
      rankImageUrl: null,
      badges: null,
      dogTags: null,
      competitive: null,
    });
  });
});

describe("toIdentityCard", () => {
  const identity = {
    personaId: "1111751848",
    nucleusId: "1000707516734",
    username: "sig4rro",
  };
  const stats = parseCardStats(gametoolsPlayerFixture);

  it("builds the full card from both endpoints", () => {
    const card = toIdentityCard(identity, stats, profileFixture);

    expect(card.rankName).toBe("Second Lieutenant V");
    expect(card.rankLevel).toBe(141);
    expect(card.rankImageUrl).toBe("https://cdn.gametools.network/ranks/bf6/t_ui_rank_140_sm.png");
    expect(card.badges).toBe(104);
    expect(card.dogTags).toBe(39);
    expect(card.bestClass).toBe("support");
    expect(card.empty).toBe(false);
    expect(card.identity.username).toBe("sig4rro");
  });

  it("reads hours and matches from gm_all, not from the top level", () => {
    const card = toIdentityCard(identity, stats, profileFixture);

    // gm_all: 745.876 s and 512 matches. The top level carries matchesPlayed 388,
    // a DIFFERENT bucket (docs §5.3) — a card showing 388 would disagree with the
    // member's own page and make a correct match look wrong.
    expect(card.hoursPlayed).toBe(207);
    expect(card.matches).toBe(512);
  });

  it("shows kills against real players, not the bot-inclusive total", () => {
    const card = toIdentityCard(identity, stats, profileFixture);
    // dividedKills.human, not the 13.695 top-level nor gm_all's 17.587.
    expect(card.kills).toBe(12320);
  });

  it("falls back to most-killed class when the profile call failed", () => {
    // Deliberately disagreeing buckets: assault has the kills, and without the
    // profile there is no kit-time to prefer.
    const killsLean = {
      secondsPlayed: 1000,
      gameModeGroups: [{ id: "gm_all", matches: 10, secondsPlayed: 7200 }],
      classes: [
        { className: "Assault", kills: 900 },
        { className: "Support", kills: 100 },
      ],
      dividedKills: { human: 1000 },
    };

    const card = toIdentityCard(identity, parseCardStats(killsLean), null);
    expect(card.bestClass).toBe("assault");
    expect(card.rankName).toBeNull();
    expect(card.hoursPlayed).toBe(2);
  });

  it("does NOT claim an account is empty when the stats call failed", () => {
    // The distinction the §11 warning depends on: "EA has no BF6 record" is a
    // finding, "we could not read it" is not. Conflating them would show a
    // stranger's-account warning to a member whose only problem was a 504.
    const card = toIdentityCard(identity, null, profileFixture);

    expect(card.empty).toBe(false);
    expect(card.kills).toBeNull();
    expect(card.hoursPlayed).toBeNull();
    expect(card.rankName).toBe("Second Lieutenant V");
  });

  it("flags an account with no BF6 record at all", () => {
    const card = toIdentityCard(
      identity,
      parseCardStats({ secondsPlayed: 0, gameModeGroups: [], classes: [], dividedKills: null }),
      parseProfilePayload({ playerProfiles: [] }),
    );

    expect(card.empty).toBe(true);
    expect(card.bestClass).toBeNull();
    expect(card.rankName).toBeNull();
  });
});
