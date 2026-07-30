// Trimmed from a REAL /bf6/stats/ response for RRRRRRRREST captured on
// 2026-07-26 (format_values=false, seperation=true). Only the fields the
// parser reads plus a few top-level aggregates kept on purpose: the parser
// must IGNORE those in favour of the gm_all group (docs/api-gametools.md §10).
export const gametoolsPlayerFixture = {
  id: "1111751848",
  userId: "1000707516734",
  userName: null,
  platform: "pc",
  kills: 13695,
  deaths: 4126,
  secondsPlayed: 745876,
  matchesPlayed: 388,
  humanPrecentage: 89.96,
  dividedKills: {
    human: 12320,
  },
  // A ONE-ELEMENT ARRAY, verified live 2026-07-29. Kept in the fixture because the
  // shape is the surprising part: a bare object here would make the parser look
  // correct in tests and read undefined in production.
  XP: [
    {
      total: 10308364,
      performance: 4007831,
      accolades: 552450,
    },
  ],
  // Per-item detail, trimmed from the live payload (53 weapons, 16 modes, 18 maps).
  // Kept small but with the two shapes that break a naive selector.
  weapons: [
    {
      type: "Machine Guns",
      weaponName: "L110",
      name: "L110",
      id: "wp_mg_l110",
      image: "https://cdn.gametools.network/weapons/bf6/T_UI_Minimi_PKG_Factory_MED.webp",
      kills: 3412,
      headshotKills: 502,
      accuracy: 21.91,
      timeEquipped: 21500,
    },
    {
      type: "Assault Rifles",
      weaponName: "M433",
      name: "M433",
      id: "wp_ar_m433",
      image: "https://cdn.gametools.network/weapons/bf6/T_UI_M433.webp",
      // Fewer kills but far more time equipped: the selector must pick by KILLS here,
      // so this row is what proves it does not fall back to time.
      kills: 1200,
      headshotKills: 180,
      accuracy: 25.4,
      timeEquipped: 90000,
    },
  ],
  gameModes: [
    {
      // THE TRAP THAT REACHED PRODUCTION. `gm_official` is a roll-up of every official
      // mode, not a mode: 725.434 s against gm_all's 745.876 s. The first live cycle
      // (2026-07-29) reported it as the most-played mode for all 68 members it read,
      // and it looked entirely plausible. Real values, kept so the filter is proven
      // against the thing that actually broke.
      gamemodeName: "Official",
      id: "gm_official",
      secondsPlayed: 725434,
      matches: 498,
      kills: 17587,
      wins: 268,
      losses: 244,
    },
    {
      gamemodeName: "Escalation",
      id: "gm_esc",
      // SVG, which is exactly why the collector drops mode artwork.
      image: "https://cdn.gametools.network/modes/bf6/escalation.svg",
      kills: 969,
      wins: 16,
      losses: 21,
      matches: 37,
      secondsPlayed: 52212,
    },
    {
      gamemodeName: "Conquest",
      id: "gm_cq",
      image: "https://cdn.gametools.network/modes/bf6/conquest.svg",
      kills: 400,
      wins: 30,
      losses: 10,
      matches: 40,
      secondsPlayed: 20000,
    },
  ],
  maps: [
    {
      // THE TRAP: index 0 is the aggregate, and it always wins a "most played"
      // comparison. Verified live 2026-07-29.
      mapName: "All",
      name: "All",
      id: "lvlmp",
      wins: 210,
      losses: 171,
      matches: 381,
      secondsPlayed: 604766,
    },
    {
      mapName: "Siege of Cairo",
      name: "Siege of Cairo",
      id: "lvlmpabbasid",
      image: "https://cdn.gametools.network/maps/bf6/T_UI_Abbasid_Large_OPT.webp",
      wins: 50,
      losses: 36,
      matches: 86,
      secondsPlayed: 113310,
    },
    {
      mapName: "Empire State",
      name: "Empire State",
      id: "lvlmpaftermath",
      image: "https://cdn.gametools.network/maps/bf6/T_UI_Aftermath_Large_OPT.webp",
      wins: 27,
      losses: 12,
      matches: 39,
      secondsPlayed: 53814,
    },
  ],
  gameModeGroups: [
    {
      gamemodeName: "All",
      id: "gm_all",
      kills: 17587,
      deaths: 4955,
      wins: 268,
      losses: 244,
      killAssists: 6080,
      matches: 512,
      revives: 3451,
      headshotKills: 2874,
      headshots: 16.34,
      objectivesCaptured: 1152,
      secondsPlayed: 745876,
      killDeath: 3.55,
      winPercent: 52.34,
      kpm: 1.41,
      dpm: 170.82,
      // Teamwork counters, captured 2026-07-27. They were missing here when the
      // columns were added, so every one of them silently read as 0 through the
      // schema's `.default(0)` and no test could catch it.
      objectivesDefended: 2483,
      objectivesDestroyed: 14,
      objectivesArmed: 25,
      objectivesDisarmed: 9,
      sectorsDefended: 63,
      objectiveTime: 105152,
      spots: 2581,
      health: 33015,
      repairs: 6756,
    },
    {
      gamemodeName: "Multiplayer",
      id: "gm_mp",
      kills: 17028,
      deaths: 4753,
      wins: 263,
      losses: 203,
      killAssists: 5928,
      matches: 466,
      revives: 3382,
      headshotKills: 2805,
      headshots: 16.47,
      objectivesCaptured: 1148,
      secondsPlayed: 694478,
      killDeath: 3.58,
      winPercent: 56.44,
      kpm: 1.47,
      dpm: 176.48,
    },
    {
      gamemodeName: "Portal",
      id: "gm_modbuilder",
      kills: 321,
      deaths: 145,
      wins: 0,
      losses: 14,
      killAssists: 96,
      matches: 14,
      revives: 39,
      headshotKills: 40,
      headshots: 12.46,
      objectivesCaptured: 4,
      secondsPlayed: 20442,
      killDeath: 2.21,
      winPercent: 0.0,
      kpm: 0.94,
      dpm: 105.55,
    },
    {
      gamemodeName: "Redsec",
      id: "gm_granite",
      kills: 238,
      deaths: 57,
      wins: 5,
      losses: 27,
      killAssists: 56,
      matches: 32,
      revives: 30,
      headshotKills: 29,
      headshots: 12.18,
      objectivesCaptured: 0,
      secondsPlayed: 30956,
      killDeath: 4.18,
      winPercent: 15.62,
      kpm: 0.46,
      dpm: 86.79,
    },
    {
      gamemodeName: "Battle Royale",
      id: "gm_granitebr",
      kills: 171,
      deaths: 51,
      wins: 3,
      losses: 27,
      killAssists: 34,
      matches: 30,
      revives: 24,
      headshotKills: 23,
      headshots: 13.45,
      objectivesCaptured: 0,
      secondsPlayed: 28372,
      killDeath: 3.35,
      winPercent: 10.0,
      kpm: 0.36,
      dpm: 73.47,
    },
  ],
  // The "All" row is the CLASS BUCKET, and `assists`/`revives` are read from it
  // (docs/api-gametools.md §10.3). The four real classes sum to it exactly —
  // 220 + 531 + 3244 + 370 = 4365 assists, 35 + 50 + 2966 + 11 = 3062 revives —
  // which is how the bucket was identified in the first place.
  classes: [
    {
      className: "All",
      kills: 13692,
      deaths: 4125,
      assists: 4365,
      revives: 3062,
      secondsPlayed: 418633,
    },
    {
      className: "Assault",
      kills: 853,
      deaths: 300,
      assists: 220,
      revives: 35,
      secondsPlayed: 22860,
    },
    {
      className: "Engineer",
      kills: 1156,
      deaths: 380,
      assists: 531,
      revives: 50,
      secondsPlayed: 43270,
    },
    {
      className: "Support",
      kills: 11297,
      deaths: 3289,
      assists: 3244,
      revives: 2966,
      secondsPlayed: 332549,
    },
    {
      className: "Recon",
      kills: 386,
      deaths: 156,
      assists: 370,
      revives: 11,
      secondsPlayed: 19954,
    },
  ],
} as const;

// Trimmed from a REAL /bf6/profile/ response for the same account (persona
// 1111751848), captured on 2026-07-29. Three properties of the live payload are
// preserved on purpose, because each one broke a naive parser:
//
//   1. `stats` is a FLAT name/value list, not an object.
//   2. Names REPEAT — the real response had 339 entries under 268 distinct names
//      — so `score_total` appears twice here with the same value. Summing would
//      double it; the first occurrence is the value.
//   3. Some entries arrive with NO `value` key at all (`kill_death_ratio`), which
//      means unknown and must not be read as zero.
export const gametoolsProfileFixture = {
  playerProfiles: [
    {
      rankName: "Second Lieutenant V",
      playerCard: {
        rank: 141,
        badges: 104,
        rankImage: {
          small: "https://cdn.gametools.network/ranks/bf6/t_ui_rank_140_sm.png",
          large: "https://cdn.gametools.network/ranks/bf6/t_ui_rank_140_lg.png",
        },
      },
      totalDogTags: { intValue: 39 },
      // Observed live 2026-07-29 and not in the anexo's field list. "Unranked" is
      // the real answer for this account, and it is the answer for most of the
      // roster, which is why the parser drops it instead of storing it.
      competitiveRanks: [
        {
          type: "CompetitiveSeason4",
          mode: "GraniteSquad0",
          modeName: "Redsec Quads",
          translationId: "ID_ARRIVAL_RANKED_BR_DIVISIONS_UNRANKED",
          rankName: "Unranked",
          rankImage: null,
        },
      ],
      stats: [
        { name: "score_total", value: 3713760 },
        { name: "kill_death_ratio" },
        { name: "matches_level", value: 413 },
        { name: "wins_level", value: 215 },
        // Seconds per kit. Support by a wide margin, which is what makes this
        // account recognisable to its owner.
        { name: "tp_kit_assault", value: 22860 },
        { name: "tp_kit_support", value: 332549 },
        { name: "tp_kit_engineer", value: 43270 },
        { name: "tp_kit_recon", value: 19954 },
        { name: "score_total", value: 3713760 },
      ],
    },
  ],
} as const;
