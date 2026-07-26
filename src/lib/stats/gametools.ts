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
    gameModeGroups: z.array(gameModeGroupSchema).default([]),
    classes: z.array(classEntrySchema).default([]),
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
 * Translates one API player into our vocabulary, reading the canonical
 * `gm_all` bucket. Null when the profile has no game-mode data (private or
 * never played) — the collector skips those instead of recording zeros.
 */
export function toRawStats(player: GametoolsPlayer): (RawStats & PlayerIdentity) | null {
  const all = player.gameModeGroups.find((group) => group.id === "gm_all");
  if (!all) return null;

  // `classes[]` includes an "All" row; the real classes map 1:1 to our enum.
  let best: { className: string; kills: number } | null = null;
  for (const entry of player.classes) {
    if (!(entry.className in CLASS_NAME_TO_ENUM)) continue;
    if (!best || entry.kills > best.kills) best = entry;
  }

  return {
    personaId: player.id,
    nucleusId: player.userId,
    kills: all.kills,
    deaths: all.deaths,
    wins: all.wins,
    losses: all.losses,
    assists: all.killAssists,
    revives: all.revives,
    headshots: all.headshotKills,
    objectivesCaptured: all.objectivesCaptured,
    timePlayedMinutes: Math.round(all.secondsPlayed / 60),
    bestClass: best ? CLASS_NAME_TO_ENUM[best.className] : null,
    matches: all.matches,
    secondsPlayed: all.secondsPlayed,
    extra: {
      // Exact play time and round count, for auditing the "played?" signal.
      secondsPlayed: all.secondsPlayed,
      matches: all.matches,
      // What tracker.gg displays as "Kills" — kept so a member comparing the
      // site with their tracker profile can be answered with data.
      humanKills: player.dividedKills?.human ?? null,
      // Pre-computed by the API over the same bucket, so they are coherent
      // with the counters above (never recompute mixing buckets).
      killDeath: all.killDeath,
      winPercent: all.winPercent,
      killsPerMinute: all.kpm,
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
