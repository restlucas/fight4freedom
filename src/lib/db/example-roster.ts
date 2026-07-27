// The placeholder roster the seed invents so the Fase 1 vitrine has enough rows
// to exercise the ranking, the 15-per-page infinite scroll and the sort filters.
//
// It lives in its own module because two scripts need it and neither can import
// the other: `seed.ts` calls `seed()` at module scope, so importing from it
// would run the seed as a side effect.
//
// These are not people. Identifying them by nickname is deliberate: the obvious
// alternative ("no Discord and no EA identity") also matches a REAL member who
// was just registered in the panel and has not claimed their invite yet, and
// deleting those would be a data loss the admin cannot undo.
export const EXAMPLE_NICKNAMES = [
  "Vortex",
  "TangoDown",
  "BlackWolf",
  "Reaper",
  "GhostBR",
  "Panzer",
  "Falcao",
  "ZeusPrime",
  "Nomad",
  "Viper",
  "Havoc",
  "Sabotage",
  "IronHand",
  "NightOwl",
  "Kraken",
  "Bandido",
  "Trovao",
  "Cascavel",
  "Predador",
  "Sentinela",
  "Fantasma",
  "Tempestade",
  "Aguia",
  "Lobo",
  "Escorpiao",
  "Chumbo",
  "Rajada",
  "Coyote",
  "Meteoro",
];
