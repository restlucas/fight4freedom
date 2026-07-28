// The scheduled collection run. Called by /api/stats/collect every 10 minutes.
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
//   1. resolve missing EA identities (a few per run, so a big backlog cannot
//      blow the request budget — the rest heal on the next runs);
//   2. fetch stats in batches of STATS_BATCH_SIZE, PERSISTING EACH BATCH;
//   3. write a snapshot only for members whose counters moved (nobody played →
//      no rows). A lost run is not an incident; the next one catches up.
//
// TIME BUDGET, and why every line of it matters
//
// The route allows 60 s (`maxDuration`). Inside that, measured 2026-07-27:
//   - one identity lookup costs ~1 s, and up to 10 run per cycle → up to ~10 s;
//   - one batch of 5 players costs ~4.5 s → ~7 batches, ~35 members, in what is
//     left of RUN_BUDGET_MS.
//
// So a roster of ~100 takes two or three cycles to sweep, not one. That is why the
// queue is ordered by staleness and why each batch is written as it arrives: the
// members a run cannot reach are the ones the next run starts with, and nothing
// already downloaded is thrown away when the clock runs out.

import type { Prisma, StatsSyncStatus } from "@prisma/client";

import { db } from "@/lib/db";

import { chunk, gametoolsProvider, STATS_BATCH_SIZE } from "./gametools";
import { eaLookupName } from "./identity";
import type { StatsProvider } from "./provider";
import { hasNewActivity } from "./snapshots";

/**
 * Upper bound of `searchPlayer` calls per run. Identity resolution is the only
 * per-member sequential work, so this caps worst-case duration when many
 * members are added at once (50 new members → resolved across ~5 runs).
 */
export const MAX_IDENTITY_RESOLUTIONS_PER_RUN = 10;

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
  updated: number;
  unchanged: number;
  noData: number;
  identityPending: number;
  /**
   * Members the run did not reach before its time budget ran out. Not an error:
   * they keep their place at the front of the queue for the next cycle, because
   * the order is oldest-snapshot-first.
   */
  deferred: number;
  /** Batches that came back completely empty and were tried a second time. */
  retriedBatches: number;
  /** Members the retry rescued. The retry's whole justification, measurable. */
  recoveredByRetry: number;
  members: { id: string; nickname: string; outcome: MemberOutcome }[];
};

/**
 * Wall-clock budget for one run, against the route's `maxDuration = 60`.
 *
 * The arithmetic that forces this: ~98 eligible members at 5 per request is ~20
 * requests, and a request costs ~4.5 s, so a full sweep wants ~80 s. The function
 * would be killed at 60 s. Stopping at 45 s leaves room to finish the batch in
 * flight, write it, and return a report instead of dying mid-call.
 *
 * Everyone is still attempted every cycle (clan decision, 2026-07-27: stats stay
 * fresh). What changes is that a sweep may span two cycles, and because the queue
 * is ordered by staleness, the members a run could not reach are exactly the ones
 * the next run starts with.
 */
const RUN_BUDGET_MS = 45_000;

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
): Promise<CollectReport> {
  const startedAt = Date.now();
  /** Members the fetch loop has already been through, for the deferred count. */
  let handled = 0;

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
      eaPersonaId: true,
      eaNucleusId: true,
      // When we last TRIED this member — the queue order. See the sort below for
      // why this is not the snapshot date.
      statsCheckedAt: true,
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
    updated: 0,
    unchanged: 0,
    noData: 0,
    identityPending: 0,
    deferred: 0,
    retriedBatches: 0,
    recoveredByRetry: 0,
    members: [],
  };
  if (members.length === 0) return report;

  // --- 1. Resolve missing EA identities (bounded per run) -------------------
  // A member with no EA name and no platform id has nothing to search for, so
  // they stay pending until an admin or the member fills it in.
  const unresolved = members.filter(
    (m) => eaLookupName(m) && (!m.eaPersonaId || !m.eaNucleusId),
  );
  // `members` is already ordered least-recently-tried first, so this slice is the
  // stalest ones — and because only these get their `statsCheckedAt` moved below,
  // the next run picks up where this one stopped instead of restarting the list.
  const searched = unresolved.slice(0, MAX_IDENTITY_RESOLUTIONS_PER_RUN);
  for (const member of searched) {
    try {
      // Search by EA display name. The match is case-exact and refuses to bind
      // when several distinct accounts answer to it — see pickIdentity in
      // ./gametools.ts for why binding one at random was the bug.
      const identity = await provider.searchPlayer(eaLookupName(member)!);
      if (!identity) continue;
      await db.member.update({
        where: { id: member.id },
        data: {
          eaPersonaId: identity.personaId,
          eaNucleusId: identity.nucleusId,
          eaUsername: identity.username,
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
  // per-run cap left untouched.
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
  const latestRows = await db.statSnapshot.findMany({
    where: { memberId: { in: collectable.map((m) => m.id) } },
    orderBy: { capturedAt: "desc" },
    distinct: ["memberId"],
    select: {
      memberId: true,
      kills: true,
      deaths: true,
      wins: true,
      losses: true,
      timePlayedMinutes: true,
    },
  });
  const latestByMember = new Map(latestRows.map((row) => [row.memberId, row]));

  // --- 3. Fetch and PERSIST batch by batch ----------------------------------
  //
  // The write used to be a single createMany after every batch had been fetched,
  // which was fine for two members and became all-or-nothing for a hundred: a run
  // killed at the function's 60 s limit threw away everything it had already
  // downloaded. Persisting per batch means a run that stops early still keeps
  // every member it reached.
  for (const slice of chunk(collectable, STATS_BATCH_SIZE)) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) {
      // Out of time. The remaining members are the stalest, so the next cycle
      // picks them up first — see the sort above.
      report.deferred = collectable.length - handled;
      break;
    }

    const identities = slice.map((m) => ({
      personaId: m.eaPersonaId!,
      nucleusId: m.eaNucleusId!,
    }));
    let stats = await provider.fetchStats(identities);

    // ONE immediate retry, and only when the ENTIRE batch came back empty.
    //
    // That emptiness is the signature of a failed request: a 504 makes the
    // provider return nothing for the whole batch, while a successful response
    // omits only the players the source genuinely has no data for. So "all
    // three missing" means the request died; "one of three missing" means that
    // one player has no BF6 data, and retrying them would burn a round trip
    // every cycle to be told the same thing.
    //
    // Retrying here rather than by re-queuing is what keeps this safe: the
    // queue is ordered by `statsCheckedAt`, and holding a failed member at the
    // front until they succeed is exactly the starvation that broke the sweep
    // on 2026-07-28. A bounded retry inside the run cannot starve anyone.
    if (stats.size === 0 && Date.now() - startedAt <= RUN_BUDGET_MS) {
      report.retriedBatches += 1;
      stats = await provider.fetchStats(identities);
      if (stats.size > 0) report.recoveredByRetry += stats.size;
    }

    handled += slice.length;

    const rows: Prisma.StatSnapshotCreateManyInput[] = [];
    // Outcome per member in this batch, so the panel can tell a working sync
    // from a broken one. `ok` covers both "counters moved" and "nothing new".
    const okIds: string[] = [];
    const noDataIds: string[] = [];

    for (const member of slice) {
      const raw = stats.get(member.eaPersonaId!);
      if (!raw) {
        report.noData += 1;
        noDataIds.push(member.id);
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
        extra: raw.extra,
      });
      report.updated += 1;
      report.members.push({
        id: member.id,
        nickname: member.nickname,
        outcome: "updated",
      });
    }

    if (rows.length > 0) {
      await db.statSnapshot.createMany({ data: rows });
    }
    await Promise.all([markStatus(okIds, "ok"), markStatus(noDataIds, "no_data")]);
  }

  return report;
}
