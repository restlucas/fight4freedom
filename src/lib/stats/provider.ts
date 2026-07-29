// The single boundary between the app and wherever stats come from.
//
// Everything downstream (collector, snapshots, ranking) depends only on these
// types, so swapping the source (gametools ↔ another API ↔ manual) never
// touches the rest of the app. See docs/api-gametools.md for why gametools is
// the source and which data bucket we read (gm_all — section 10.3).

import type { PlayerClass } from "@prisma/client";

/**
 * Stable identity of a player on EA's side. Nicknames change, these ids do
 * not, which is why they are persisted on `member` and used for every stats
 * fetch instead of the display name.
 */
export type PlayerIdentity = {
  /** EA persona id (`playerid` on the API). */
  personaId: string;
  /**
   * EA nucleus id — account-level id the batch endpoint also requires, and the
   * only value in the payload that identifies the ACCOUNT rather than one of its
   * platform personas. Measured on the live roster 2026-07-28: seven members have
   * one nucleus id carrying two persona ids (one per platform), and both personas
   * return byte-identical stats. Two DIFFERENT nucleus ids mean two different
   * accounts, and those do disagree — see pickIdentity in ./gametools.ts.
   */
  nucleusId: string;
};

/**
 * What a name lookup returns: the identity plus the label that makes a candidate
 * recognisable to a human.
 *
 * Separate from `PlayerIdentity` on purpose. Fetching stats needs the two ids and
 * nothing else, so folding `username` into the identity would force every caller
 * of `fetchStats` to carry a field it has no use for.
 */
export type ResolvedIdentity = PlayerIdentity & {
  /**
   * EA `username`, captured at resolution time. Never an input and never a
   * lookup key: it is not searchable (searching a username returns nothing) and
   * it is not unique — two distinct accounts named OJUN10R share the username
   * `OJUN10R`. Kept because it is the most human-readable way to tell two
   * candidates apart when someone has to choose between them.
   */
  username: string | null;
};

/**
 * Outcome of resolving a display name, kept richer than `PlayerIdentity | null`
 * so "nobody by that name" and "several different people by that name" stay
 * distinguishable. Only the first is a data-entry problem; the second needs a
 * human to pick, and `candidates` is what that screen would render.
 */
export type IdentityMatch =
  | { status: "resolved"; identity: ResolvedIdentity }
  | { status: "not-found" }
  | { status: "ambiguous"; candidates: ResolvedIdentity[] };

/**
 * One member's cumulative stats, already translated to OUR vocabulary.
 *
 * Semantics a replacement provider must honour (clan decisions, see
 * docs/api-gametools.md §10.3). The split is by what the stat is ABOUT:
 *
 *   - **Duelling other players** — `kills`, `deaths`, `assists`, `revives` — use
 *     the narrower "attributed to an infantry class" scope, which is what
 *     tracker.gg shows and what the clan treats as the reference.
 *   - **Objectives and map control** — everything else — covers ALL modes,
 *     vehicles, Portal and REDSEC included.
 *
 * One honesty note that matters when swapping sources: only `kills` carries a
 * genuine bot filter. `assists` and `revives` are narrowed in SCOPE but **still
 * include bots**, because the gametools/EA payload publishes no human-filtered
 * variant of either. Do not document them as bot-free.
 *
 * A provider that cannot separate bot kills should return null for the member
 * rather than quietly counting them.
 */
export type RawStats = {
  /** Kills against real players. Bots excluded. */
  kills: number;
  /** Deaths from the same bucket as `kills`. */
  deaths: number;
  wins: number;
  losses: number;
  assists: number;
  revives: number;
  headshots: number;
  objectivesCaptured: number;
  timePlayedMinutes: number;
  // Teamwork counters — what the monthly ranking is built on (src/lib/stats/points.ts).
  objectivesDefended: number;
  objectivesDestroyed: number;
  objectivesArmed: number;
  objectivesDisarmed: number;
  sectorsDefended: number;
  /** Seconds spent standing on an objective. */
  objectiveTimeSeconds: number;
  /** Enemies marked for the team (all classes, not just Recon). */
  spots: number;
  /** Hit points restored to teammates. */
  healthRestored: number;
  /** Vehicle repairs. Collected but not scored — Engineer-locked. */
  repairs: number;
  /** Class with the most kills, or null when the source cannot tell. */
  bestClass: PlayerClass | null;
  /**
   * Rounds counted by the game and exact seconds played: the "played since the
   * last snapshot" signal. Not stored as columns — matches is derivable
   * (wins + losses) and seconds live in `extra`.
   */
  matches: number;
  secondsPlayed: number;
  /** Curated extra metrics persisted in `statSnapshot.extra` (jsonb). */
  extra: Record<string, number | string | null>;
};

/**
 * Everything needed for a HUMAN to recognise an EA account as their own, in one
 * object. Not a stats type: it exists for the identity screen, where the only
 * question is "is this you?".
 *
 * The fields were chosen against what the source actually publishes (probed
 * 2026-07-29 on the live API), and the notable absence is deliberate: there is
 * **no last-activity timestamp anywhere in the EA payload** — not in
 * `/bf6/stats/`, not in `/bf6/profile/`, whose entire response was walked looking
 * for one. `lastPlayedAt` therefore comes from OUR history (the newest snapshot)
 * and is null for an account we have never collected. Never present a null here
 * as "never played"; it means "we have not watched this account".
 *
 * Every field is nullable because the two endpoints fail independently and a card
 * missing its rank is still far better for identification than no card at all.
 */
export type IdentityCard = {
  identity: ResolvedIdentity;
  /** In-game rank, as the game words it ("Second Lieutenant V"). */
  rankName: string | null;
  /** Numeric level behind that rank (141), and the insignia artwork EA serves. */
  rankLevel: number | null;
  rankImageUrl: string | null;
  /** Hours from the same `gm_all` bucket the site displays, so numbers match. */
  hoursPlayed: number | null;
  matches: number | null;
  /** Kills against real players — the number the member sees on their own page. */
  kills: number | null;
  /**
   * Class the account has spent the most TIME on (`tp_kit_*`), not the one with
   * the most kills. Time is the better recognition cue: a player knows they are a
   * medic, and a support main can still have most kills on assault.
   */
  bestClass: PlayerClass | null;
  badges: number | null;
  dogTags: number | null;
  /**
   * True when EA has no BF6 record for this account at all (see isEmptyProfile).
   * The §11 signature: a real account that is not this person's. The screen must
   * show it as a warning instead of an empty card.
   */
  empty: boolean;
};

export interface StatsProvider {
  /**
   * Resolves an EA display name to the stable identity. Null when nobody carries
   * that name AND when several different accounts do: binding one of them at
   * random is how a member ends up showing a stranger's stats, so an ambiguous
   * name stays unbound until someone resolves it. Use `matchPlayer` when the
   * caller can tell those two cases apart.
   */
  searchPlayer(name: string, username?: string | null): Promise<ResolvedIdentity | null>;

  /** Same lookup, keeping "not found" and "ambiguous" distinguishable. */
  matchPlayer(name: string, username?: string | null): Promise<IdentityMatch>;

  /**
   * Fetches cumulative stats for many players, batched however the source
   * requires. Returns a map keyed by personaId; players the source failed to
   * return (private profile, transient error) are simply absent — a partial
   * result is normal and the collector treats absence as "skip this run".
   */
  fetchStats(players: PlayerIdentity[]): Promise<Map<string, RawStats>>;

  /**
   * Everything a human needs to recognise one account, for the identity screen.
   *
   * Separate from `fetchStats` even though both read the same account, because
   * they answer different questions and fail differently. `fetchStats` is a batch
   * whose absent members simply retry next cycle; this one is interactive, runs
   * for at most a handful of candidates, and must return a partially-filled card
   * rather than nothing when one of its calls fails.
   *
   * Null only when the source told us nothing at all.
   */
  fetchIdentityCard(identity: ResolvedIdentity): Promise<IdentityCard | null>;
}
