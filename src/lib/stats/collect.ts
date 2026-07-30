// The scheduled collection run.
//
// TWO CALLERS, and the difference between them is only how much clock they hand
// over. The Railway worker (worker/main.ts) runs the real cycle every 20 minutes
// with minutes to spend; /api/stats/collect is the manual trigger, capped by the
// function's 60 s. Everything else about the run is identical, which is why the
// profile is an argument (see CollectOptions) and not a second code path.
//
// Lifecycle (decided with the clan owner, 2026-07-26): a freshly registered
// member is NOT collected. They enter the next run only after claiming their
// invite with Discord — `member.discordId` is set exclusively by that verified
// flow, so a Discord link is what normally makes a member eligible.
//
// One documented exception (2026-07-27): `collectWithoutLogin`, for the one-time
// import of the members who already existed on the v1 site. They are collected
// without ever having logged in. See the column's comment in the schema.
//
// The run is deliberately boring and idempotent:
//   1. resolve missing EA identities (bounded per profile and by a share of the
//      clock, so a big backlog cannot blow the sweep's budget — the rest heal on
//      the next runs);
//   2. fetch stats in ROUNDS, PERSISTING EACH BATCH (see the rounds loop);
//   3. write a snapshot only for members whose counters moved (nobody played →
//      no rows). A lost run is not an incident; the next one catches up.
//
// The queue is ordered by staleness and every batch is written as it arrives, so a
// run that stops early keeps everything it downloaded and the next run starts with
// exactly the members this one could not reach.

import type { Prisma, StatsSyncStatus } from "@prisma/client";

import { db } from "@/lib/db";

import { recordCollectionEvents, type CreditedMember } from "./events";
import { chunk, gametoolsProvider, STATS_BATCH_SIZE } from "./gametools";
import { eaLookupName } from "./identity";
import { accrueCareerPoints } from "./points";
import type { RawStats, StatsProvider } from "./provider";
import { hasNewActivity, STAT_TOTALS_SELECT } from "./snapshots";

/**
 * Upper bound of `searchPlayer` calls per run, one value per profile. Identity
 * resolution is the only per-member SEQUENTIAL work in a run, so this is what
 * keeps a backlog of unbound members from eating the clock the sweep needs.
 *
 * TWO VALUES because the two callers have different clocks, and the single 10 was
 * calibrated against the one that no longer exists: the 45 s Vercel function. On
 * the worker, 10 searches (~24 s at the 2,4 s per search measured by
 * `db:resolve-identities`, 74 of 97 in 229 s) against an 8-minute budget whose
 * sweep takes ~165 s is not protection, it is a member waiting up to three cycles
 * to be looked up — an hour at the 20-minute cadence.
 *
 * 25 clears the whole known backlog in one cycle (23 members whose exported
 * platform id does not exist on EA) and still leaves the sweep its measured ~220 s
 * inside 480. Anyone registered after that waits one cycle instead of three.
 */
export const ROUTE_IDENTITY_LIMIT = 10;
export const WORKER_IDENTITY_LIMIT = 25;

/**
 * Share of the budget the identity phase may spend before it stops starting new
 * searches, whatever the cap above allows.
 *
 * The cap is a count, not a time bound, and the two stop being interchangeable
 * when the source degrades: `SEARCH_TIMEOUT_MS` is 10 s, so 25 searches against a
 * slow EA is 250 s of a 480 s budget and the SWEEP is what gets cut. Normally this
 * guard never fires — 25 searches at 2,4 s is 60 s, comfortably inside the 120 s
 * it allows on the worker — so the cap binds on a healthy run and the clock binds
 * on a bad one, which is when reading stats matters more than binding a new name.
 */
export const IDENTITY_PHASE_SHARE = 0.25;

/**
 * How many members get their GAME PROFILE read per cycle (rank, badges, dog tags,
 * ranked division — see `fetchGameProfile`).
 *
 * A cap and not a sweep, because unlike stats this costs one request per member:
 * reading all 98 every cycle would be 98 requests every 20 minutes against a free
 * community API, to refresh a value that moves every few dozen hours of play.
 *
 * 10 per cycle covers the roster in 10 cycles, about 3 h 20 at the 20-minute
 * cadence, for ~10 requests of 14 KB each (measured 2026-07-29). Nothing here is
 * urgent: a member who levels up sees it on the site within a few hours, and the
 * numbers score nothing.
 *
 * The route profile reads fewer because its whole budget is 45 s.
 */
export const ROUTE_PROFILE_LIMIT = 3;
export const WORKER_PROFILE_LIMIT = 10;

/**
 * Clock guard for the profile pass: it never starts a new request past this share
 * of the budget.
 *
 * 95 %, so the pass only runs on what the sweep left over. That ordering is the
 * whole design — the profile is cosmetic and the snapshot is the product, so on a
 * cycle where the source is slow the right outcome is every member's stats read
 * and nobody's badge count refreshed.
 */
export const PROFILE_PHASE_DEADLINE_SHARE = 0.95;

export type MemberOutcome =
  /** Counters moved since the last snapshot — a new row was written. */
  | "updated"
  /** Fetched fine, nothing changed — no row written. */
  | "unchanged"
  /** The source returned nothing for them this run (private profile, batch error). */
  | "no-data"
  /** EA identity not resolved yet — will retry on the next runs. */
  | "identity-pending";

export type CollectReport = {
  /** Members matching the eligibility rule at the start of the run. */
  eligible: number;
  /** Identities resolved (and persisted) during this run. */
  identitiesResolved: number;
  /**
   * Members whose GAME profile was read and stored this run (rank, badges, dog
   * tags, division). Bounded by `profileLimit`, so on a healthy worker cycle this
   * is exactly that number and a smaller one means the clock guard fired.
   */
  gameProfilesRead: number;
  updated: number;
  unchanged: number;
  noData: number;
  identityPending: number;
  /**
   * Members the run never asked about, because the budget ran out first. Not an
   * error: they are left unstamped, so their older `statsCheckedAt` puts them at
   * the front of the next cycle's queue (the order is least-recently-TRIED first —
   * see the sort, and never by snapshot date).
   *
   * Expected to be 0 on the worker profile: the first real cycle swept 75 members
   * in 164,9 s against an 8-minute budget. A non-zero value there means the source
   * degraded, and the worker logs a warning for exactly that.
   */
  deferred: number;
  /** Rounds that actually ran, 1..rounds.length. One means nobody needed a retry. */
  roundsRun: number;
  /** Requests issued by the retry rounds — everything after the first pass. */
  retriedBatches: number;
  /** Members a retry round rescued. The retry's whole justification, measurable. */
  recoveredByRetry: number;
  /**
   * Career points credited this run, summed across members (src/lib/ranks.ts).
   *
   * In the report so the ladder is auditable from the outside: divide by 150 (the
   * calibrated points per hour) and it should match the hours the clan played
   * since the last cycle. A number far off that is the signal that either the
   * weights or the thresholds drifted.
   */
  pointsAccrued: number;
  /**
   * Members who ended the run with no data AND have never been read successfully,
   * not once — `statsReadAt` is null. Nicknames, because this list is meant to be
   * read by a human in the worker log.
   *
   * Separated from `noData` because the two ask for different actions and looked
   * identical until 2026-07-28. A member with history whose batch 504'd is a bad
   * round and needs nothing. A member who has NEVER been read is almost always
   * bound to the wrong EA account — the name matched some account, just not
   * theirs — and no number of cycles will fix that. Four of them sat in `noData`
   * for days, indistinguishable from transient failures.
   */
  neverRead: string[];
  members: { id: string; nickname: string; outcome: MemberOutcome }[];
};

/** How much clock and how many passes a run gets. See the two presets below. */
export type CollectOptions = {
  /** Wall-clock budget. No new request starts once it is spent. */
  budgetMs?: number;
  /**
   * Batch size of each pass over the members still without data, so the LENGTH of
   * this array is the attempt count. See the rounds loop for why passes beat
   * retrying a batch on the spot, and why the last one is one player per request.
   */
  rounds?: number[];
  /**
   * How many identity searches this run may start. See the two limits above; the
   * clock guard applies on top of whatever is passed here.
   */
  identityLimit?: number;
  /**
   * How many GAME profiles this run may read. One request each, so this is a
   * request budget; see the two limits above.
   */
  profileLimit?: number;
};

/**
 * ROUTE PROFILE — the manual trigger (curl today, no panel button), bounded by
 * `maxDuration = 60`.
 *
 * 45 s, not 60: a request that 504s always takes ~15,2 s (the source's gateway
 * clock), so a run allowed to start one at 59 s would be killed mid-write instead
 * of returning a report. Two passes are declared, and on a full roster the second
 * simply never starts — the budget is gone. That is deliberate: on a small manual
 * run there IS room for it, and the loop only spends what it has.
 *
 * A roster of ~99 does not fit here at all, and no longer needs to. Whatever this
 * profile cannot reach is not lost, it is just left for the worker's next cycle.
 */
export const ROUTE_BUDGET_MS = 45_000;
export const ROUTE_ROUNDS = [STATS_BATCH_SIZE, STATS_BATCH_SIZE];

/**
 * WORKER PROFILE — the real cycle, on Railway, with no function limit.
 *
 * 8 minutes against the 20-minute Railway schedule (applied 2026-07-28; the cron
 * expression is in docs/plano.md, not here, because a slash-star inside a JSDoc
 * block closes the comment).
 * The ceiling is not there to save time, it is there so a hung upstream can never
 * leave two runs overlapping: a run that cannot finish in 8 exits and the next tick
 * starts clean. It stayed at 8 when the cadence doubled because it bounds the run,
 * not the gap — the sweep is ~4 min, so raising it would only buy a longer hang.
 *
 * 8 and not 10 because the budget bounds when a request may START, not when it
 * ends. `startedAt` is taken before identity resolution, so the whole run is
 * inside it, and the only overrun possible is the request in flight when the clock
 * expires — capped at BATCH_TIMEOUT_MS (30 s) by the provider. Worst case is
 * therefore ~8,5 min, comfortably inside the tick.
 *
 * The measured sweep is far below it. At 2,22 s per member read (lote 3,
 * 2026-07-28) a 99-member pass is ~3,7 min, and the retry rounds are tiny by
 * construction — ~14 members in the second, ~2 in the third.
 */
export const WORKER_BUDGET_MS = 8 * 60_000;
export const WORKER_ROUNDS = [STATS_BATCH_SIZE, STATS_BATCH_SIZE, 1];

/**
 * Records the outcome of an attempt against a set of members.
 *
 * One `updateMany` per outcome group rather than one update per member: a sweep
 * touches ~76 rows, and this keeps that at a handful of statements.
 *
 * Two timestamps, deliberately: `statsCheckedAt` moves on EVERY attempt, so the
 * queue rotates and the panel can say "when did we last try"; `statsReadAt`
 * moves only on `ok`, so staleness is measurable. Collapsing them into one would
 * lose whichever question the survivor does not answer.
 */
async function markStatus(memberIds: string[], status: StatsSyncStatus): Promise<void> {
  if (memberIds.length === 0) return;
  const now = new Date();
  await db.member.updateMany({
    where: { id: { in: memberIds } },
    data: {
      statsStatus: status,
      statsCheckedAt: now,
      ...(status === "ok" ? { statsReadAt: now } : {}),
    },
  });
}

export async function collectStats(
  provider: StatsProvider = gametoolsProvider,
  {
    budgetMs = ROUTE_BUDGET_MS,
    rounds = ROUTE_ROUNDS,
    identityLimit = ROUTE_IDENTITY_LIMIT,
    profileLimit = ROUTE_PROFILE_LIMIT,
  }: CollectOptions = {},
): Promise<CollectReport> {
  const startedAt = Date.now();

  const members = await db.member.findMany({
    // The eligibility rule — see the file header.
    where: {
      active: true,
      // An admin can take a member out of the collection without hiding them
      // from the vitrine — for a known-bad platform id, so the run stops
      // spending requests on a lookup that cannot succeed.
      statsPaused: false,
      OR: [{ discordId: { not: null } }, { collectWithoutLogin: true }],
    },
    select: {
      id: true,
      nickname: true,
      // The EA display name resolves the identity; `platformId` is only the
      // fallback for rows created before the two were separated. The clan
      // nickname is display only and is never used for lookups.
      eaName: true,
      platformId: true,
      // Not a lookup key — a tiebreak between accounts sharing a display name.
      eaUsername: true,
      eaPersonaId: true,
      eaNucleusId: true,
      // When we last TRIED this member — the queue order. See the sort below for
      // why this is not the snapshot date.
      statsCheckedAt: true,
      // Queue order for the profile pass, which rotates on its own clock because
      // it is capped per cycle rather than swept.
      gameProfileReadAt: true,
      // When a read last WORKED. Null after a run that failed means "never once",
      // which is the signal for `neverRead` — see its field in CollectReport.
      statsReadAt: true,
      // The balance BEFORE this run, which is what makes a rank crossing
      // detectable at the only moment it is knowable (see ./events.ts).
      rankPoints: true,
    },
  });

  // LEAST-RECENTLY-TRIED FIRST. Never alphabetical, and — the subtle part — never
  // by snapshot date either.
  //
  // Ordering by the newest snapshot looks equivalent and is not: a member fetched
  // successfully who simply has not played gets NO new snapshot, so their date
  // never moves. They stay pinned at the front and are re-fetched every single
  // run, while the members behind them are never reached. Measured 2026-07-28:
  // the queue advanced by ONE member in four minutes, with 38 of 76 stuck
  // unvisited behind a handful of idle players being fetched over and over.
  //
  // `statsCheckedAt` advances on every attempt, successful or not, so the queue
  // actually rotates. Members never tried sort first.
  members.sort((a, b) => {
    const at = a.statsCheckedAt?.getTime() ?? 0;
    const bt = b.statsCheckedAt?.getTime() ?? 0;
    return at - bt || a.nickname.localeCompare(b.nickname, "pt-BR");
  });

  const report: CollectReport = {
    eligible: members.length,
    identitiesResolved: 0,
    gameProfilesRead: 0,
    updated: 0,
    unchanged: 0,
    noData: 0,
    identityPending: 0,
    deferred: 0,
    roundsRun: 0,
    retriedBatches: 0,
    recoveredByRetry: 0,
    pointsAccrued: 0,
    neverRead: [],
    members: [],
  };
  if (members.length === 0) return report;

  // --- 1. Resolve missing EA identities (bounded per run) -------------------
  // A member with no EA name and no platform id has nothing to search for, so
  // they stay pending until an admin or the member fills it in.
  const unresolved = members.filter((m) => eaLookupName(m) && (!m.eaPersonaId || !m.eaNucleusId));
  // `members` is already ordered least-recently-tried first, so this slice is the
  // stalest ones — and because only these get their `statsCheckedAt` moved below,
  // the next run picks up where this one stopped instead of restarting the list.
  const selected = unresolved.slice(0, identityLimit);
  /** The ones actually asked about: the clock guard can stop this short. */
  const searched: typeof selected = [];
  const identityDeadline = startedAt + budgetMs * IDENTITY_PHASE_SHARE;
  for (const member of selected) {
    // The count cap says how many are worth searching; this says when searching
    // stops being worth it at all. Whoever is left is not stamped, so the older
    // `statsCheckedAt` puts them at the front of the next cycle — the same
    // mechanism the cap itself relies on.
    if (Date.now() > identityDeadline) break;
    searched.push(member);
    try {
      // Search by EA display name. The match is case-exact and refuses to bind
      // when several distinct accounts answer to it — see pickIdentity in
      // ./gametools.ts for why binding one at random was the bug.
      const identity = await provider.searchPlayer(eaLookupName(member)!, member.eaUsername);
      if (!identity) continue;
      await db.member.update({
        where: { id: member.id },
        data: {
          eaPersonaId: identity.personaId,
          eaNucleusId: identity.nucleusId,
          // Only filled in when nobody typed one: an admin-entered username is
          // the tiebreak, so a resolution must not overwrite it.
          ...(member.eaUsername ? {} : { eaUsername: identity.username }),
        },
      });
      member.eaPersonaId = identity.personaId;
      member.eaNucleusId = identity.nucleusId;
      report.identitiesResolved += 1;
    } catch (error) {
      console.warn(
        `[stats] busca de identidade falhou para ${member.nickname}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  // Worth a line in the log because it means the source was slow enough to eat a
  // quarter of the budget before a single stat was read, and the sweep is running
  // on what is left.
  if (searched.length < selected.length) {
    console.warn(
      `[stats] busca de identidade interrompida em ${searched.length}/${selected.length}: ` +
        `${(IDENTITY_PHASE_SHARE * 100).toFixed(0)}% do orcamento gasto antes do fetch — ` +
        "os restantes vao na frente da fila no proximo ciclo",
    );
  }

  const collectable = members.filter((m) => m.eaPersonaId && m.eaNucleusId);
  const pending = members.filter((m) => !m.eaPersonaId || !m.eaNucleusId);
  for (const member of pending) {
    report.identityPending += 1;
    report.members.push({
      id: member.id,
      nickname: member.nickname,
      outcome: "identity-pending",
    });
  }
  // ONLY the members this run actually searched are stamped — never the ones the
  // cap or the clock guard left untouched. `searched` is the attempted list for
  // exactly this reason, not the slice.
  //
  // Stamping all of them is what broke identity resolution completely, and the
  // failure is invisible from the outside: every pending member came out of each
  // run with the SAME `statsCheckedAt`, so the sort below fell through to its
  // alphabetical tiebreak and picked the same first ten names on every single
  // cycle. The other fifteen were never searched once. Measured 2026-07-28 over
  // 21 consecutive ticks: `identitiesResolved` was 0 in all of them, and two
  // members whose identity was deliberately cleared for a rebind never got
  // looked up because their nicknames sort late.
  //
  // Leaving the untouched ones alone keeps the column honest — it means "when we
  // last TRIED this member", and we did not try them — and that older timestamp
  // is exactly what floats them to the front of the queue next run.
  const searchedIds = new Set(searched.map((m) => m.id));
  await markStatus(
    pending.filter((m) => searchedIds.has(m.id)).map((m) => m.id),
    "identity_pending",
  );

  if (collectable.length === 0) return report;

  // --- 2. Latest snapshot per member, to diff against -----------------------
  // `distinct` + desc order = the newest snapshot per member, in one query.
  //
  // EVERY counter, via STAT_TOTALS_SELECT, not the five the activity check needs:
  // since 2026-07-28 this row is also the base of the career points accrual, and
  // a hand-written list that forgets a counter does not fail to compile — it
  // silently scores that counter as zero forever. `eaNucleusId` rides along
  // because accrual across a rebind has to be refused (see accrueCareerPoints).
  const latestRows = await db.statSnapshot.findMany({
    where: { memberId: { in: collectable.map((m) => m.id) } },
    orderBy: { capturedAt: "desc" },
    distinct: ["memberId"],
    select: { memberId: true, eaNucleusId: true, ...STAT_TOTALS_SELECT },
  });
  const latestByMember = new Map(latestRows.map((row) => [row.memberId, row]));

  // --- 3. Fetch in ROUNDS, persisting each batch -----------------------------
  //
  // ROUND-BASED RETRY. Each pass covers everyone still without data, so a member
  // whose request died is only asked again after the rest of the roster has been
  // swept. Three things come out of that, and the first is the one that matters:
  //
  //  1. TIME PASSES between attempts. A 504 is the source's gateway giving up on
  //     EA at ~15,2 s. Asking again two seconds later asks the same cold path the
  //     same question; asking minutes later is a different question.
  //  2. Everyone gets a first attempt as early as possible, instead of the queue
  //     stalling behind one batch that spends 15,2 s twice in a row.
  //  3. The later passes are tiny, so they can afford ONE player per request,
  //     which isolates whoever is actually timing out instead of letting them
  //     take two healthy members down with them.
  //
  // Against the measured 14 % per-batch failure rate, three passes leave ~0,3 %
  // of batches unread per cycle (0,14³), against 14 % for a single pass.
  //
  // WHAT COUNTS AS RETRYABLE is unchanged, and load-bearing: only a WHOLE empty
  // response. That emptiness is the signature of a dead request, whereas a
  // response missing one of three players means that player has no BF6 data —
  // re-asking them would buy a round trip every cycle to be told the same thing.
  //
  // Writes stay per batch, so a run that stops early keeps everything it read.

  /** Persists one successful batch and returns how many members it read. */
  const persistBatch = async (
    slice: typeof collectable,
    stats: Map<string, RawStats>,
  ): Promise<number> => {
    const rows: Prisma.StatSnapshotCreateManyInput[] = [];
    // Outcome per member, so the panel can tell a working sync from a broken one.
    // `ok` covers both "counters moved" and "nothing new".
    const okIds: string[] = [];
    const noDataIds: string[] = [];
    /** Career points to credit, per member. Only members whose counters moved. */
    const accrued: { id: string; points: number }[] = [];
    /** The same credits, described for the activity feed (see ./events.ts). */
    const credited: CreditedMember[] = [];

    for (const member of slice) {
      const raw = stats.get(member.eaPersonaId!);
      if (!raw) {
        // Absent from a response that DID come back: the source has nothing for
        // this player. Settled here and now, never queued for a retry round.
        //
        // This is where a wrong `eaName` lands, and it is the common case — the
        // account exists, so the response includes it, just empty. `isEmptyProfile`
        // in ./gametools.ts logs the persona and says what to check.
        report.noData += 1;
        noDataIds.push(member.id);
        if (member.statsReadAt === null) report.neverRead.push(member.nickname);
        report.members.push({
          id: member.id,
          nickname: member.nickname,
          outcome: "no-data",
        });
        continue;
      }
      okIds.push(member.id);

      if (!hasNewActivity(latestByMember.get(member.id) ?? null, raw)) {
        report.unchanged += 1;
        report.members.push({
          id: member.id,
          nickname: member.nickname,
          outcome: "unchanged",
        });
        continue;
      }

      rows.push({
        memberId: member.id,
        source: "api",
        // Stamped so a later rebind cannot make these totals comparable with
        // another account's — see deltaForMonth.
        eaNucleusId: member.eaNucleusId,
        kills: raw.kills,
        deaths: raw.deaths,
        wins: raw.wins,
        losses: raw.losses,
        assists: raw.assists,
        revives: raw.revives,
        headshots: raw.headshots,
        objectivesCaptured: raw.objectivesCaptured,
        timePlayedMinutes: raw.timePlayedMinutes,
        bestClass: raw.bestClass,
        objectivesDefended: raw.objectivesDefended,
        objectivesDestroyed: raw.objectivesDestroyed,
        objectivesArmed: raw.objectivesArmed,
        objectivesDisarmed: raw.objectivesDisarmed,
        sectorsDefended: raw.sectorsDefended,
        objectiveTimeSeconds: raw.objectiveTimeSeconds,
        spots: raw.spots,
        healthRestored: raw.healthRestored,
        repairs: raw.repairs,
        // Free of charge: they ride in the payload this batch already downloaded.
        // Never scored — see the columns' own comments in the schema.
        xpTotal: raw.xpTotal,
        xpPerformance: raw.xpPerformance,
        xpAccolades: raw.xpAccolades,
        extra: raw.extra,
      });
      // CAREER POINTS, credited only here — on the same condition that writes a
      // snapshot. A member read with nothing new earns nothing, which is what
      // makes this idempotent against re-reads: the accrual is tied to the row
      // being inserted, not to the member being fetched.
      const previous = latestByMember.get(member.id) ?? null;
      const points = accrueCareerPoints(previous, {
        ...raw,
        eaNucleusId: member.eaNucleusId,
      });
      if (points > 0) {
        accrued.push({ id: member.id, points });
        credited.push({
          memberId: member.id,
          pointsBefore: member.rankPoints,
          pointsGained: points,
          // Clamped: the source occasionally reports a lower total than before,
          // and negative minutes would shrink an open session.
          minutesGained: Math.max(
            0,
            raw.timePlayedMinutes - (previous?.timePlayedMinutes ?? raw.timePlayedMinutes),
          ),
        });
      }

      report.updated += 1;
      report.pointsAccrued += points;
      report.members.push({
        id: member.id,
        nickname: member.nickname,
        outcome: "updated",
      });
    }

    if (rows.length > 0) {
      await db.statSnapshot.createMany({ data: rows });
    }
    await writeTopItems(slice, stats);
    // One statement per member rather than a grouped update: `increment` is the
    // point — reading the balance and writing back a computed total would lose a
    // concurrent credit, and the manual route can run while the worker is mid
    // cycle. A batch is three members, so this is three statements at worst.
    await Promise.all([
      ...accrued.map(({ id, points }) =>
        db.member.update({ where: { id }, data: { rankPoints: { increment: points } } }),
      ),
      markStatus(okIds, "ok"),
      markStatus(noDataIds, "no_data"),
    ]);

    // After the balances, never before: a promotion event that outlived a failed
    // credit would announce something that did not happen.
    await recordCollectionEvents(credited);
    return okIds.length;
  };

  /** Members still owed a reading. Shrinks with every round. */
  let pool = collectable;
  let outOfTime = false;

  for (let round = 0; round < rounds.length; round += 1) {
    if (pool.length === 0 || outOfTime) break;
    report.roundsRun = round + 1;

    /** Whose request died this round — the next round's pool. */
    const failed: typeof collectable = [];
    const batches = chunk(pool, rounds[round]);

    for (let i = 0; i < batches.length; i += 1) {
      if (Date.now() - startedAt > budgetMs) {
        outOfTime = true;
        const unreached = batches.slice(i).flat();
        if (round === 0) {
          // Never asked about at all. Left UNSTAMPED on purpose: the older
          // `statsCheckedAt` is exactly what floats them to the front of the
          // next cycle's queue.
          report.deferred = unreached.length;
        } else {
          // Already asked once and it failed, so they are a reading we owe, not
          // a member we skipped. They fall through to `no_data` below.
          failed.push(...unreached);
        }
        break;
      }

      const slice = batches[i];
      if (round > 0) report.retriedBatches += 1;

      const stats = await provider.fetchStats(
        slice.map((m) => ({ personaId: m.eaPersonaId!, nucleusId: m.eaNucleusId! })),
      );

      // The whole response came back empty: the request died, nothing was
      // learned about anyone in it. Hand them to the next round untouched —
      // no status write, so a rescued member never shows up as a failure.
      if (stats.size === 0) {
        failed.push(...slice);
        continue;
      }

      const read = await persistBatch(slice, stats);
      if (round > 0) report.recoveredByRetry += read;
    }

    pool = failed;
  }

  // Out of rounds (or out of clock) with members still unread. Recorded as
  // `no_data` rather than left silent: `statsCheckedAt` has to move so the queue
  // rotates, and `statsReadAt` has to stay put so the staleness stays visible.
  if (pool.length > 0) {
    report.noData += pool.length;
    for (const member of pool) {
      report.members.push({ id: member.id, nickname: member.nickname, outcome: "no-data" });
      // Never read once, across every cycle this member has existed for. See the
      // `neverRead` field: this is the shape of a wrong `eaName`, not bad luck.
      if (member.statsReadAt === null) report.neverRead.push(member.nickname);
    }
    await markStatus(
      pool.map((m) => m.id),
      "no_data",
    );
  }

  await readGameProfiles(provider, collectable, report, {
    limit: profileLimit,
    deadline: startedAt + budgetMs * PROFILE_PHASE_DEADLINE_SHARE,
  });

  return report;
}

/**
 * Rewrites each member's best weapon, most-played mode and most-played map.
 *
 * UPSERT BY (member, kind), which is what keeps this table at three rows per member
 * for good: the row means "this member's best weapon", so the item inside it changes
 * when their favourite does, and no write can make the table grow.
 *
 * Only the kinds the payload actually answered are touched. A member whose weapons
 * list came back empty keeps the weapon we already knew about instead of having it
 * deleted, which matters because the source occasionally serves a partially zeroed
 * payload (see `isIncoherentPayload`).
 *
 * NEVER THROWS. These three rows are a panel; the snapshot is the product, and it is
 * already written by the time this runs.
 */
async function writeTopItems(
  slice: { id: string; eaPersonaId: string | null; eaNucleusId: string | null }[],
  stats: Map<string, RawStats>,
): Promise<void> {
  try {
    const writes = [];
    for (const member of slice) {
      const raw = stats.get(member.eaPersonaId!);
      if (!raw) continue;

      for (const item of raw.topItems) {
        const data = {
          itemId: item.itemId,
          name: item.name,
          group: item.group,
          imageUrl: item.imageUrl,
          // Stamped so a rebind can discard the previous account's items with a
          // single delete, exactly like the snapshots.
          eaNucleusId: member.eaNucleusId,
          kills: item.kills,
          matches: item.matches,
          wins: item.wins,
          losses: item.losses,
          secondsUsed: item.secondsUsed,
          metrics: item.metrics ?? undefined,
        };
        writes.push(
          db.memberTopItem.upsert({
            where: { memberId_kind: { memberId: member.id, kind: item.kind } },
            create: { memberId: member.id, kind: item.kind, ...data },
            update: data,
          }),
        );
      }
    }
    // At most three per member, so nine for a batch of three.
    if (writes.length > 0) await Promise.all(writes);
  } catch (error) {
    console.warn(
      "[stats] nao foi possivel gravar os itens de destaque:",
      error instanceof Error ? error.message : error,
    );
  }
}

/** What the profile pass needs from a member, and nothing more. */
type ProfileCandidate = {
  id: string;
  nickname: string;
  eaPersonaId: string | null;
  eaNucleusId: string | null;
  gameProfileReadAt: Date | null;
};

/**
 * Refreshes the GAME profile of a few members: in-game rank, badge and dog-tag
 * counts, ranked division.
 *
 * LAST IN THE CYCLE AND CAPPED, which are the two things that keep it honest. It
 * costs one request per member against a free community API, and none of what it
 * reads scores anything, so it may only spend what the sweep left over. On a cycle
 * where the source is slow the right outcome is every member's stats read and
 * nobody's badge count refreshed.
 *
 * NEVER THROWS. The snapshots are already written by the time this runs, and a
 * cosmetic refresh must not be able to fail a cycle whose product already landed.
 */
async function readGameProfiles(
  provider: StatsProvider,
  collectable: ProfileCandidate[],
  report: CollectReport,
  { limit, deadline }: { limit: number; deadline: number },
): Promise<void> {
  if (limit <= 0) return;

  try {
    // Least-recently-read first, never-read ahead of everyone. Same ordering rule
    // as the stats queue, for the same reason: it is the only one that rotates.
    const queue = [...collectable]
      .filter((member) => member.eaPersonaId && member.eaNucleusId)
      .sort((a, b) => {
        const at = a.gameProfileReadAt?.getTime() ?? 0;
        const bt = b.gameProfileReadAt?.getTime() ?? 0;
        return at - bt || a.nickname.localeCompare(b.nickname, "pt-BR");
      })
      .slice(0, limit);

    for (const member of queue) {
      if (Date.now() > deadline) break;

      let profile = null;
      try {
        profile = await provider.fetchGameProfile({
          personaId: member.eaPersonaId!,
          nucleusId: member.eaNucleusId!,
        });
      } catch (error) {
        console.warn(
          `[stats] perfil de jogo falhou para ${member.nickname}:`,
          error instanceof Error ? error.message : error,
        );
      }

      // STAMPED ON EVERY ATTEMPT, success or not, and this is the line that keeps
      // the queue moving. A member whose profile always fails would otherwise keep
      // the oldest timestamp forever and be re-picked every cycle, starving the 88
      // behind them. That is not hypothetical: stamping only on success is what
      // froze identity resolution for 21 consecutive cycles on 2026-07-28 (see
      // "Fila da coleta" in docs/plano.md), and the shape of the bug is identical.
      //
      // The profile FIELDS are written only on success, so a bad afternoon never
      // erases a rank we already hold — `fetchGameProfile` cannot tell "the request
      // died" from "this account has no rank", so its null is not an answer.
      await db.member.update({
        where: { id: member.id },
        data: {
          gameProfileReadAt: new Date(),
          ...(profile
            ? {
                gameRankName: profile.rankName,
                gameRankLevel: profile.rankLevel,
                gameRankImageUrl: profile.rankImageUrl,
                badgeCount: profile.badges,
                dogTagCount: profile.dogTags,
                competitiveRankName: profile.competitive?.rankName ?? null,
                competitiveRankMode: profile.competitive?.mode ?? null,
              }
            : {}),
        },
      });

      if (profile) report.gameProfilesRead += 1;
    }
  } catch (error) {
    console.warn(
      "[stats] passada de perfis de jogo abortada:",
      error instanceof Error ? error.message : error,
    );
  }
}
