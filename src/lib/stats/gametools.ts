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

import type {
  IdentityMatch,
  PlayerIdentity,
  RawStats,
  ResolvedIdentity,
  StatsProvider,
} from "./provider";

const BASE_URL = "https://api.gametools.network";

/**
 * Players per request. Three — and the number that decided it is not the failure
 * RATE, it is the cost of a failure.
 *
 * A 504 always lands at ~15.2 s, whatever the batch size: that is their gateway's
 * clock, not work being done. A success is much cheaper. So a failed batch burns
 * a third of the 45 s run budget and brings back nobody, which makes the failure
 * rate expensive out of proportion to how it reads as a percentage.
 *
 * Measured against the live API on 2026-07-28, same roster, back to back:
 *
 *   size 5 -> 50% of batches 504 | success 3.5-10.4 s | 4.02 s per member READ
 *   size 3 -> 14% of batches 504 | success 2.0-11.1 s | 2.22 s per member READ
 *   size 1 -> 10% of requests 504 |                    | 5.17 s per member READ
 *
 * The last column is the one that matters, and it is not monotonic: one player
 * per request has the best success rate and the WORST throughput, because a
 * ~3.5 s round trip amortises over a single member instead of three.
 *
 * In run terms (45 s budget, batches sequential): size 5 reads ~11 members per
 * execution, size 3 reads ~20. Against a ~77-member roster that is the
 * difference between needing two cron ticks and finishing inside one.
 *
 * The earlier ceiling still holds — 10, 25, 50 and 76 per request all 504 — and
 * the payload is ~700 KB per player, so this cannot grow much regardless.
 */
export const STATS_BATCH_SIZE = 3;

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
        // Defaulted, not required: `username` is a convenience for telling
        // candidates apart, never a lookup key, so a payload without it must
        // still resolve rather than throw away the whole search.
        username: z.string().nullish().default(null),
        // The namespace the persona lives in ("ea", "steam", "xboxone"). Used
        // only as the last tiebreak, never as a filter on our own `platform`
        // column, which disagrees with this value for 40 of 70 resolved members.
        platform: z.string().nullish().default(null),
      })
      .loose(),
  ),
});

export type SearchResult = z.output<typeof searchResponseSchema>["results"][number];

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
    /**
     * The "All" row of `classes[]` is the CLASS BUCKET, and it is where assists
     * and revives come from. Defaulted rather than required because the API
     * omits them on empty profiles, and losing a whole batch to a missing
     * counter is worse than reading a zero we can detect elsewhere.
     */
    assists: z.number().default(0),
    revives: z.number().default(0),
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
    /**
     * Top-level play time. Read ONLY by `isEmptyProfile` — never as a stat, since
     * the top level mixes buckets (§5.3) and the counters we keep come from
     * `gm_all`. Defaulted because a completely empty profile omits it, and that
     * omission is exactly the case the predicate exists to catch.
     */
    secondsPlayed: z.number().default(0),
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
  // Class-attributed revives are a subset of the all-mode count, same logic.
  const classAll = player.classes.find((entry) => entry.className === "All");
  if (classAll && all.revives > 0 && classAll.revives > all.revives) return true;
  return false;
}

/**
 * Translates one API player into our vocabulary.
 *
 * TWO BUCKETS, SPLIT BY WHAT THE STAT IS ABOUT (clan decision, 2026-07-27):
 *
 *   - Counters about DUELLING OTHER PLAYERS come from the CLASS bucket, the
 *     same scope tracker.gg displays: `kills` (further filtered to
 *     `dividedKills.human`), `deaths`, `assists` and `revives`.
 *   - Counters about OBJECTIVES AND MAP CONTROL stay on `gm_all`, covering every
 *     mode including Portal and REDSEC: captures, defends, arms, disarms,
 *     sectors, objective time, spots, healing, repairs, wins, losses, time
 *     played. They have no class-bucket equivalent at all — `classes[]` carries
 *     only nine fields — so this half is not a choice, it is the only option.
 *
 * WHAT THE CLASS BUCKET IS AND IS NOT: it is "attributed to an infantry class",
 * NOT "against real players". Only `kills` gets a genuine bot filter, via
 * `dividedKills.human`. **`assists` and `revives` still include bots**, because
 * the API publishes no human-filtered variant of either — verified by walking
 * the whole payload on 2026-07-27. They moved here for parity with tracker.gg,
 * which the clan treats as the reference, not because bots were removed.
 *
 * The kills/deaths pairing is corroborated by the API: 12320 / 4126 = 2.99, its
 * own `infantryKillDeath`. Pairing human kills with `gm_all.deaths` yields 2.49,
 * a ratio it never reports — the signature of mixed buckets.
 *
 * Null when the profile has no game-mode data, no class bucket, no human kill
 * count, or when the payload contradicts itself — the collector skips those
 * instead of recording zeros, and retries on the next run.
 */
/**
 * Whether the account has NO Battlefield 6 record at all.
 *
 * Not "a fresh player with zeros" — a fresh player still gets the structure, with
 * `gameModeGroups` and the five `classes[]` rows filled with zeros. This is the
 * shape of a response where EA has nothing to say about the account: both lists
 * empty and no time played.
 *
 * It matters because it has ONE likely cause, and it is not the source being
 * flaky: **the bound account is not the member's**. Investigated on 2026-07-28 for
 * the four members who had never once been read — every persona of their accounts
 * came back like this, while `/bf6/profile/` returned no rank and no badges. One
 * of the four was then resolved by fixing `eaName` (`Bravo_six762` → `F4F WISLAN`),
 * and the correct account had 65.533 kills across 836 matches.
 *
 * A name search that finds A account is not a name search that finds THE account:
 * `pickIdentity` only disambiguates between several candidates, so a single
 * coincidentally-named account binds silently and is retried forever.
 */
export function isEmptyProfile(player: GametoolsPlayer): boolean {
  return (
    player.gameModeGroups.length === 0 &&
    player.classes.length === 0 &&
    (player.secondsPlayed ?? 0) === 0
  );
}

export function toRawStats(player: GametoolsPlayer): (RawStats & PlayerIdentity) | null {
  // Checked before anything else so the log names the actual cause. Falling
  // through to the "sem dividedKills.human" warning below would describe a
  // missing field, when the truth is that the whole profile is absent — and that
  // difference is what separates "retry next cycle" from "fix the eaName".
  if (isEmptyProfile(player)) {
    console.warn(
      `[stats] persona ${player.id} (conta ${player.userId}) NAO TEM NENHUM DADO DE BF6: ` +
        `sem gameModeGroups, sem classes, zero tempo jogado. Quase sempre significa que o ` +
        `eaName do membro casou com outra conta EA de nome parecido — conferir o EA ID com ele`,
    );
    return null;
  }

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

  // The "All" row of classes[] is the class bucket: assists and revives read
  // from it. Substituting the wider gm_all values would silently change scope on
  // two scored counters, so a missing row is treated as no-data instead.
  const classAll = player.classes.find((entry) => entry.className === "All");
  if (!classAll) {
    console.warn(
      `[stats] persona ${player.id} sem a linha classes[All] — sem assists/revives, retenta no proximo ciclo`,
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
    // --- duelling other players: CLASS bucket (see the docblock) ---
    kills: humanKills,
    deaths: player.deaths,
    assists: classAll.assists,
    revives: classAll.revives,
    // --- everything below: gm_all, all modes ---
    wins: all.wins,
    losses: all.losses,
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
      // The wider totals we deliberately do NOT show, kept so "why does the site
      // say fewer X than the tracker?" is answerable from the row itself. All
      // four were the numbers on the site before 2026-07-27.
      allModeKills: all.kills,
      allModeDeaths: all.deaths,
      allModeAssists: all.killAssists,
      allModeRevives: all.revives,
      // The class bucket before the bot filter, so the size of that filter is
      // auditable: classKills - kills = bot kills.
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

/**
 * Chooses which of the search results IS the member. Pure, so the real payloads
 * that motivated it can be pinned in tests.
 *
 * The problem, measured against the live roster on 2026-07-28: `displayName` is
 * the only searchable field and it is NOT unique. Ten members returned more than
 * one candidate. The previous rule — first case-insensitive hit — is a coin toss
 * among them, and it lost twice: `Ovaca` was bound to an emptied `OVaca`
 * (0 kills) while the real account had 13.562, and `morpheus98` was bound to a
 * stranger's `Morpheus98` (242 kills) instead of the member's 9.949.
 *
 * Four steps, each one only narrowing the field:
 *
 * 1. CASE-EXACT displayName. EA treats case as significant, so `morpheus98`,
 *    `Morpheus98` and `oVaca` are three different accounts. This step alone
 *    settles every ambiguous member in the roster but one: `wesleyreinan` and
 *    `WesleyReinan` are two different people, and only the first is the member.
 *    Falls back to case-insensitive when nothing matches exactly.
 *
 * 2. GROUP BY nucleusId. What looks like a duplicate usually is not: the same
 *    account appears once per platform persona, and every persona of an account
 *    returns identical stats (verified on all seven members where this happens).
 *    One distinct nucleus id means one account, and any of its personas is a
 *    correct answer.
 *
 * 3. CASE-EXACT username, when the caller knows it. Not a lookup key — EA's
 *    search does not index it — but a legitimate tiebreak between accounts that
 *    survived step 1.
 *
 * 4. PREFER platform "ea". The last word, and the step that settles the only
 *    real two-account case in the roster: both OJUN10R accounts carry the same
 *    displayName AND the same username, so 1 and 3 cannot separate them, and the
 *    `ea` one is the member's (10.501 kills against 6).
 *
 * Steps 3 and 4 are applied ONLY when they leave at least one candidate. That
 * matters: 19 of 76 accounts have no `ea` persona at all, and a mistyped username
 * would otherwise empty the set and turn a resolvable member into a permanent
 * "not found" — silent, and indistinguishable from a name that does not exist.
 */
export function pickIdentity(
  results: SearchResult[],
  name: string,
  username?: string | null,
): IdentityMatch {
  const exact = results.filter((r) => r.displayName === name);
  let candidates = exact.length
    ? exact
    : results.filter((r) => r.displayName.toLowerCase() === name.toLowerCase());

  if (candidates.length === 0) return { status: "not-found" };

  const toIdentity = (r: SearchResult): ResolvedIdentity => ({
    personaId: r.personaId,
    nucleusId: r.nucleusId,
    username: r.username ?? null,
  });
  const accounts = (list: SearchResult[]) => new Set(list.map((r) => r.nucleusId));

  /** Applies a tiebreak, ignoring it when it would leave nothing behind. */
  const narrow = (by: (r: SearchResult) => boolean) => {
    const kept = candidates.filter(by);
    if (kept.length > 0) candidates = kept;
  };

  if (accounts(candidates).size > 1 && username) narrow((r) => r.username === username);
  if (accounts(candidates).size > 1) narrow((r) => r.platform === "ea");

  if (accounts(candidates).size === 1) {
    return { status: "resolved", identity: toIdentity(candidates[0]) };
  }
  return { status: "ambiguous", candidates: candidates.map(toIdentity) };
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

  async matchPlayer(name: string, username?: string | null): Promise<IdentityMatch> {
    const url = `${this.baseUrl}/bf6/player/?name=${encodeURIComponent(name)}`;
    const payload = await fetchJson(url, {}, SEARCH_TIMEOUT_MS);
    const { results } = searchResponseSchema.parse(payload);
    return pickIdentity(results, name, username);
  }

  async searchPlayer(name: string, username?: string | null): Promise<ResolvedIdentity | null> {
    const match = await this.matchPlayer(name, username);
    if (match.status === "resolved") return match.identity;
    if (match.status === "ambiguous") {
      // Left unbound on purpose. See pickIdentity: picking one of several
      // accounts at random is what put a stranger's stats on a member's profile.
      console.warn(
        `[stats] "${name}" casa com ${match.candidates.length} contas EA distintas; ` +
          `nao vinculado automaticamente`,
      );
    }
    return null;
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
