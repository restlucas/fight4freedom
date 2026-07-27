// The scheduled collection run. Called by /api/stats/collect every 10 minutes.
//
// Lifecycle (decided with the clan owner, 2026-07-26): a freshly registered
// member is NOT collected. They enter the next run only after claiming their
// invite with Discord — `member.discordId` is set exclusively by that verified
// flow, so `active && discordId != null` is the eligibility rule.
//
// The run is deliberately boring and idempotent:
//   1. resolve missing EA identities (a few per run, so a big backlog cannot
//      blow the request budget — the rest heal on the next runs);
//   2. fetch stats in batches through the provider;
//   3. write a snapshot only for members whose counters moved (nobody played →
//      no rows). A lost run is not an incident; the next one catches up.

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

import { gametoolsProvider } from "./gametools";
import type { PlayerIdentity, StatsProvider } from "./provider";
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
  members: { id: string; nickname: string; outcome: MemberOutcome }[];
};

export async function collectStats(
  provider: StatsProvider = gametoolsProvider,
): Promise<CollectReport> {
  const members = await db.member.findMany({
    // The eligibility rule — see the file header.
    where: { active: true, discordId: { not: null } },
    select: {
      id: true,
      nickname: true,
      // The exact account id on the platform — what resolves the EA identity.
      // The nickname is display only and is never used for lookups.
      platformId: true,
      eaPersonaId: true,
      eaNucleusId: true,
    },
    orderBy: { nickname: "asc" },
  });

  const report: CollectReport = {
    eligible: members.length,
    identitiesResolved: 0,
    updated: 0,
    unchanged: 0,
    noData: 0,
    identityPending: 0,
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

  // --- 2. Fetch, in batches, through the provider ---------------------------
  const identities: PlayerIdentity[] = collectable.map((m) => ({
    personaId: m.eaPersonaId!,
    nucleusId: m.eaNucleusId!,
  }));
  const stats = await provider.fetchStats(identities);

  // --- 3. Diff against the latest snapshot; write only real activity --------
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

  const rows: Prisma.StatSnapshotCreateManyInput[] = [];
  for (const member of collectable) {
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

  return report;
}
