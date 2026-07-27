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

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

import { chunk, gametoolsProvider, STATS_BATCH_SIZE } from "./gametools";
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
      OR: [{ discordId: { not: null } }, { collectWithoutLogin: true }],
    },
    select: {
      id: true,
      nickname: true,
      // The exact account id on the platform — what resolves the EA identity.
      // The nickname is display only and is never used for lookups.
      platformId: true,
      eaPersonaId: true,
      eaNucleusId: true,
      // Newest snapshot per member, to order the queue by staleness below.
      snapshots: {
        orderBy: { capturedAt: "desc" },
        take: 1,
        select: { capturedAt: true },
      },
    },
  });

  // STALEST FIRST, never alphabetical. A run can hit its budget before sweeping
  // everyone, and with a fixed alphabetical order the tail of the roster would be
  // starved forever — the same names dropped every single cycle. Sorting by the
  // last capture makes the queue self-balancing: whoever a run misses is at the
  // front of the next one. Members never collected sort first.
  members.sort((a, b) => {
    const at = a.snapshots[0]?.capturedAt?.getTime() ?? 0;
    const bt = b.snapshots[0]?.capturedAt?.getTime() ?? 0;
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
    members: [],
  };
  if (members.length === 0) return report;

  // --- 1. Resolve missing EA identities (bounded per run) -------------------
  // Members registered before platformId became mandatory may have none; there
  // is nothing to search for, so they stay pending until an admin fills it in.
  const unresolved = members.filter((m) => m.platformId && (!m.eaPersonaId || !m.eaNucleusId));
  for (const member of unresolved.slice(0, MAX_IDENTITY_RESOLUTIONS_PER_RUN)) {
    try {
      // Search by platform id (the exact EA account name); the search only
      // binds on an exact match (see GametoolsProvider.searchPlayer).
      const identity = await provider.searchPlayer(member.platformId!);
      if (!identity) continue;
      await db.member.update({
        where: { id: member.id },
        data: {
          eaPersonaId: identity.personaId,
          eaNucleusId: identity.nucleusId,
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
  for (const member of members) {
    if (!member.eaPersonaId || !member.eaNucleusId) {
      report.identityPending += 1;
      report.members.push({
        id: member.id,
        nickname: member.nickname,
        outcome: "identity-pending",
      });
    }
  }
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

    const stats = await provider.fetchStats(
      slice.map((m) => ({ personaId: m.eaPersonaId!, nucleusId: m.eaNucleusId! })),
    );
    handled += slice.length;

    const rows: Prisma.StatSnapshotCreateManyInput[] = [];
    for (const member of slice) {
      const raw = stats.get(member.eaPersonaId!);
      if (!raw) {
        report.noData += 1;
        report.members.push({
          id: member.id,
          nickname: member.nickname,
          outcome: "no-data",
        });
        continue;
      }

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
  }

  return report;
}
