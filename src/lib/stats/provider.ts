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
  /** EA nucleus id — account-level id the batch endpoint also requires. */
  nucleusId: string;
};

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

export interface StatsProvider {
  /**
   * Resolves a display name to the stable identity. Null when the player does
   * not exist (or the name is ambiguous beyond recognition).
   */
  searchPlayer(name: string): Promise<PlayerIdentity | null>;

  /**
   * Fetches cumulative stats for many players, batched however the source
   * requires. Returns a map keyed by personaId; players the source failed to
   * return (private profile, transient error) are simply absent — a partial
   * result is normal and the collector treats absence as "skip this run".
   */
  fetchStats(players: PlayerIdentity[]): Promise<Map<string, RawStats>>;
}
