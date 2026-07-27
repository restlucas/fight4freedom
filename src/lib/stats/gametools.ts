// GametoolsProvider — StatsProvider backed by api.gametools.network, a proxy
// of EA's own stats API (docs/api-gametools.md; the tracker.gg comparison in
// §10 shows both serve identical data).
//
// Contract decisions, all documented in that file:
//  - `seperation=true` + `format_values=false` on every stats call.
//  - Stats are read from the `gm_all` game-mode group (all modes, vehicles,
//    Portal and REDSEC included), NEVER from the top-level aggregate, which
//    mixes buckets (§5.3).
//  - Fetches go through POST /bf6/multiple/ in small sequential batches: one
//    in-flight request at a time is the politeness mechanism toward a free
//    community API. The endpoint itself takes up to 128 players.
//  - Ids over names: `player_id` + `user_id` skip the name lookup and survive
//    nickname changes.

import { z } from "zod";

import type { PlayerClass } from "@prisma/client";

import type { PlayerIdentity, RawStats, StatsProvider } from "./provider";

const BASE_URL = "https://api.gametools.network";

/** Batch size agreed with the clan owner (2026-07-26): 10 per request. */
export const STATS_BATCH_SIZE = 10;

const SEARCH_TIMEOUT_MS = 10_000;
// A cold-cache batch was measured at ~2-6 s for 2 players; give 10 players room.
const BATCH_TIMEOUT_MS = 30_000;

// --- Response schemas (validate only what we read; extra keys pass through) --

const searchResponseSchema = z.object({
  results: z.array(
    z
      .object({
        displayName: z.string(),
        personaId: z.coerce.string(),
        nucleusId: z.coerce.string(),
      })
      .loose(),
  ),
});

const gameModeGroupSchema = z
  .object({
    id: z.string(),
    kills: z.number(),
    deaths: z.number(),
    wins: z.number(),
    // The group spells `losses` correctly; only the top-level uses `loses`.
    losses: z.number(),
    killAssists: z.number(),
    matches: z.number(),
    revives: z.number(),
    headshotKills: z.number(),
    objectivesCaptured: z.number(),
    secondsPlayed: z.number(),
    killDeath: z.number(),
    winPercent: z.number(),
    kpm: z.number(),
    dpm: z.number(),
    // Teamwork counters. Optional with a 0 fallback on purpose: they were added
    // to our schema after the first collections, and a community API that once
    // served a partially zeroed payload (see isIncoherentBucket) is not one to
    // trust for field presence. A missing field must degrade to 0, never throw
    // and lose the whole batch.
    objectivesDefended: z.number().default(0),
    objectivesDestroyed: z.number().default(0),
    objectivesArmed: z.number().default(0),
    objectivesDisarmed: z.number().default(0),
    sectorsDefended: z.number().default(0),
    objectiveTime: z.number().default(0),
    spots: z.number().default(0),
    /** Hit points restored. Named `health` in the payload, which reads like a gauge. */
    health: z.number().default(0),
    repairs: z.number().default(0),
  })
  .loose();

const classEntrySchema = z
  .object({
    className: z.string(),
    kills: z.number(),
  })
  .loose();

const playerStatsSchema = z
  .object({
    /** personaId, echoed back — how a batch result maps to our member. */
    id: z.coerce.string(),
    /** nucleusId. */
    userId: z.coerce.string(),
    /**
     * CLASS-bucket totals. The top level of this payload mixes buckets and is
     * mostly a trap (docs/api-gametools.md §5.3), but these two are the class
     * bucket exactly, and that is the bucket `dividedKills.human` is a subset
     * of — so they are the only coherent partner for our kill count.
     */
    kills: z.number(),
    deaths: z.number(),
    gameModeGroups: z.array(gameModeGroupSchema).default([]),
    classes: z.array(classEntrySchema).default([]),
    /**
     * `human` is the canonical kill count for this site: kills against real
     * players, bots excluded (clan decision, 2026-07-27). Nullish because the
     * API omits the object for profiles with nothing in it; a member without it
     * is treated as no-data rather than as zero.
     */
    dividedKills: z.object({ human: z.number() }).loose().nullish(),
  })
  .loose();

export type GametoolsPlayer = z.infer<typeof playerStatsSchema>;

// Verified against the live API (2026-07-26): 2+ players come wrapped in
// `{ data: [...] }`, a single player comes back as the bare object.
const multipleResponseSchema = z.union([
  z.object({ data: z.array(playerStatsSchema) }),
  playerStatsSchema,
]);

/** Normalizes both envelope shapes of POST /bf6/multiple/ into a list. */
export function parsePlayersPayload(payload: unknown): GametoolsPlayer[] {
  const parsed = multipleResponseSchema.parse(payload);
  return "data" in parsed && Array.isArray(parsed.data)
    ? (parsed.data as GametoolsPlayer[])
    : [parsed as GametoolsPlayer];
}

const CLASS_NAME_TO_ENUM: Record<string, PlayerClass> = {
  Assault: "assault",
  Engineer: "engineer",
  Support: "support",
  Recon: "recon",
};

/**
 * Whether a payload contradicts itself and must not be trusted.
 *
 * Observed live on 2026-07-26 21:00: the API returned `kills: 0` and
 * `deaths: 0` inside `gm_all` while the SAME bucket reported `killDeath: 3.55`
 * and `kpm: 1.41` — a partially zeroed response, not a reading. It cost us
 * twice: a bogus snapshot, and then a fake `0 -> 17587` jump that
 * `hasNewActivity` accepted as real play, which poisons the month delta
 * (`deltaForMonth` baselines on the month's earliest snapshot).
 *
 * `gm_all` still matters even though kills no longer come from it: every
 * teamwork counter does, so a broken bucket means a broken snapshot.
 *
 * The test is strictly self-contradiction, never "the numbers look small": a
 * genuinely fresh player (zero kills, zero ratios) is coherent and must pass,
 * otherwise we would never record anyone's first session.
 */
export function isIncoherentPayload(
  player: GametoolsPlayer,
  all: z.infer<typeof gameModeGroupSchema>,
): boolean {
  // Ratios are derived FROM kills upstream, so neither can outlive it.
  if (all.kills === 0 && (all.killDeath > 0 || all.kpm > 0)) return true;
  // Nobody finishes a match without dying at least once.
  if (all.kills === 0 && all.deaths === 0 && all.matches > 0) return true;
  // Human kills are a SUBSET of the class bucket, so they cannot exceed it.
  const human = player.dividedKills?.human;
  if (human != null && player.kills > 0 && human > player.kills) return true;
  return false;
}

/**
 * Translates one API player into our vocabulary.
 *
 * Two buckets, on purpose, and the pairing is not arbitrary:
 *
 *   - `kills` is `dividedKills.human` — kills against real players, bots
 *     excluded (clan decision, 2026-07-27, replacing the earlier "everything
 *     including bots" rule).
 *   - `deaths` is the CLASS-bucket death count, because that is the bucket
 *     `dividedKills.human` lives in. Corroborated by the API itself:
 *     12320 / 4126 = 2.99, which is exactly the `infantryKillDeath` it
 *     publishes. Pairing human kills with `gm_all.deaths` instead yields 2.49,
 *     a ratio the API never reports — the signature of mixed buckets.
 *   - every other counter stays on `gm_all`, because no human/bot split exists
 *     for them. That asymmetry is deliberate and documented in the plan.
 *
 * Null when the profile has no game-mode data, no human kill count, or when the
 * payload contradicts itself — the collector skips those instead of recording
 * zeros, and retries on the next run.
 */
export function toRawStats(player: GametoolsPlayer): (RawStats & PlayerIdentity) | null {
  const all = player.gameModeGroups.find((group) => group.id === "gm_all");
  if (!all) return null;

  // No human split means we cannot produce the canonical number. Falling back to
  // `gm_all.kills` would silently mix bot kills into a column that promises none.
  const humanKills = player.dividedKills?.human;
  if (humanKills == null) {
    console.warn(
      `[stats] persona ${player.id} sem dividedKills.human — sem kills canonicas, retenta no proximo ciclo`,
    );
    return null;
  }

  if (isIncoherentPayload(player, all)) {
    console.warn(
      `[stats] payload incoerente para persona ${player.id}: gm_all kills=${all.kills} ` +
        `deaths=${all.deaths} killDeath=${all.killDeath} | classe kills=${player.kills} ` +
        `human=${humanKills} — descartado, retenta no proximo ciclo`,
    );
    return null;
  }

  // `classes[]` includes an "All" row; the real classes map 1:1 to our enum.
  let best: { className: string; kills: number } | null = null;
  for (const entry of player.classes) {
    if (!(entry.className in CLASS_NAME_TO_ENUM)) continue;
    if (!best || entry.kills > best.kills) best = entry;
  }

  return {
    personaId: player.id,
    nucleusId: player.userId,
    // Bots excluded. See the docblock for why deaths comes from the class bucket.
    kills: humanKills,
    deaths: player.deaths,
    wins: all.wins,
    losses: all.losses,
    assists: all.killAssists,
    revives: all.revives,
    headshots: all.headshotKills,
    objectivesCaptured: all.objectivesCaptured,
    timePlayedMinutes: Math.round(all.secondsPlayed / 60),
    bestClass: best ? CLASS_NAME_TO_ENUM[best.className] : null,
    objectivesDefended: all.objectivesDefended,
    objectivesDestroyed: all.objectivesDestroyed,
    objectivesArmed: all.objectivesArmed,
    objectivesDisarmed: all.objectivesDisarmed,
    sectorsDefended: all.sectorsDefended,
    objectiveTimeSeconds: all.objectiveTime,
    spots: all.spots,
    healthRestored: all.health,
    repairs: all.repairs,
    matches: all.matches,
    secondsPlayed: all.secondsPlayed,
    extra: {
      // Exact play time and round count, for auditing the "played?" signal.
      secondsPlayed: all.secondsPlayed,
      matches: all.matches,
      // The two kill totals we deliberately do NOT show, kept so "why does the
      // site say fewer kills than X?" is answerable from the row itself. Before
      // 2026-07-27 `allModeKills` was the number on the site.
      allModeKills: all.kills,
      allModeDeaths: all.deaths,
      classKills: player.kills,
      // Ratios the API pre-computes over the ALL-MODE bucket. Prefixed because
      // they are NOT this member's displayed K/D or KPM: ours derive from the
      // human kill count, so they are lower by design.
      allModeKillDeath: all.killDeath,
      allModeKillsPerMinute: all.kpm,
      // Win rate and damage never depended on the kill bucket, so they stand.
      winPercent: all.winPercent,
      damagePerMinute: all.dpm,
    },
  };
}

/** Splits a list into consecutive slices of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`gametools respondeu ${response.status} em ${new URL(url).pathname}`);
  }
  return response.json();
}

export class GametoolsProvider implements StatsProvider {
  constructor(private readonly baseUrl: string = BASE_URL) {}

  async searchPlayer(name: string): Promise<PlayerIdentity | null> {
    const url = `${this.baseUrl}/bf6/player/?name=${encodeURIComponent(name)}`;
    const payload = await fetchJson(url, {}, SEARCH_TIMEOUT_MS);
    const { results } = searchResponseSchema.parse(payload);

    // The endpoint is a fuzzy search; only an exact (case-insensitive) match
    // is safe to bind to a member automatically.
    const match = results.find((result) => result.displayName.toLowerCase() === name.toLowerCase());
    return match ? { personaId: match.personaId, nucleusId: match.nucleusId } : null;
  }

  async fetchStats(players: PlayerIdentity[]): Promise<Map<string, RawStats>> {
    const stats = new Map<string, RawStats>();

    for (const batch of chunk(players, STATS_BATCH_SIZE)) {
      const url = `${this.baseUrl}/bf6/multiple/?format_values=false&seperation=true`;
      const body = batch.map((player) => ({
        player_id: Number(player.personaId),
        user_id: Number(player.nucleusId),
        // ea/xbox/psn/steam are all the same platform for stats (see the API
        // docs); "pc" is the value their own examples use.
        platform: "pc",
      }));

      try {
        const payload = await fetchJson(
          url,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
          BATCH_TIMEOUT_MS,
        );
        for (const player of parsePlayersPayload(payload)) {
          const raw = toRawStats(player);
          if (raw) stats.set(raw.personaId, raw);
        }
      } catch (error) {
        // One bad batch must not sink the run: the members in it stay absent
        // from the map (= skipped this cycle) and the next cycle retries.
        console.warn(
          `[stats] lote gametools falhou (${batch.length} jogadores):`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    return stats;
  }
}

/** Default instance used by the collector; tests build their own with a fake fetch. */
export const gametoolsProvider = new GametoolsProvider();
