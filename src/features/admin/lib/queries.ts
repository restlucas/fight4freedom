// Admin reads. Deliberately NOT cached: the panel must always show the live
// state, and a stale row here means an admin acts on wrong information.

import type { MedalTier, MemberRole, Platform, StatsSyncStatus } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * What the panel shows in the "Stats" column, already resolved to ONE state.
 *
 * Derived here rather than in the component because the answer depends on four
 * columns interacting (`active`, `statsPaused`, eligibility, `statsStatus`), and
 * splitting that logic across a JSX ternary is how a member ends up shown as
 * "syncing" while the collector never looks at them.
 *
 * Order matters: a paused member is paused even if their last attempt failed,
 * and an ineligible member is ineligible even if paused.
 */
export type MemberSyncState =
  /** Inactive, or eligible for nothing — the collector skips them entirely. */
  | "off"
  /** An admin took them out of the collection on purpose. */
  | "paused"
  /** Eligible and never attempted yet. */
  | "waiting"
  /** Last attempt read their stats. */
  | "ok"
  /** Last attempt found no BF6 data — usually the id resolved to another account. */
  | "no_data"
  /** No EA identity: the platform id matches no EA account. */
  | "identity_pending";

export type MemberSync = {
  state: MemberSyncState;
  /** ISO instant of the last attempt, successful or not. Null if never tried. */
  checkedAt: string | null;
  /**
   * ISO instant of the last SUCCESSFUL read — how old the data actually is.
   * Null when no attempt ever worked. Distinct from `checkedAt` on purpose:
   * a member can be attempted every cycle and still hold stale data if every
   * attempt lands in a failed batch.
   */
  readAt: string | null;
  /**
   * The last attempt brought nothing back, but the member HAS stats from before
   * — so the collection works and only this round missed. Shown as a warning
   * next to a healthy badge, never as a broken state (see `syncState`).
   */
  lastAttemptFailed: boolean;
  /** Whether an admin may pause/resume this member (pointless when "off"). */
  canPause: boolean;
  paused: boolean;
};

type SyncInput = {
  active: boolean;
  statsPaused: boolean;
  discordId: string | null;
  collectWithoutLogin: boolean;
  eaPersonaId: string | null;
  statsStatus: StatsSyncStatus | null;
  /** Whether the member has ever had stats recorded. */
  hasStats: boolean;
};

function syncState(m: SyncInput): MemberSyncState {
  const eligible = m.active && (m.discordId !== null || m.collectWithoutLogin);
  if (!eligible) return "off";
  if (m.statsPaused) return "paused";
  // The stored outcome is the truth about the last attempt; the identity column
  // is the fallback for members the collector has not stamped yet.
  if (m.statsStatus === "ok") return "ok";
  // A failed attempt on a member who already HAS stats is not a broken member,
  // it is a bad round. Measured on 2026-07-28: of 29 members carrying "no_data",
  // 24 had earlier snapshots — the source 504s on roughly half the batches, and
  // the whole batch comes back empty. Calling those 24 "Sem retorno" sent an
  // admin hunting two dozen id problems that did not exist. They read as
  // syncing, with a warning icon carrying the caveat.
  if (m.statsStatus === "no_data") return m.hasStats ? "ok" : "no_data";
  if (m.statsStatus === "identity_pending" || !m.eaPersonaId) return "identity_pending";
  return "waiting";
}

/** True only when the badge is healthy BECAUSE of history, not this attempt. */
function lastAttemptFailed(m: SyncInput): boolean {
  return syncState(m) === "ok" && m.statsStatus === "no_data";
}

export type AdminInvite = {
  id: string;
  grantsAdmin: boolean;
  discordUsername: string | null;
  expiresAt: string;
  usedAt: string | null;
};

export type AdminAward = {
  medalId: string;
  /** ISO instant, so the value survives serialization to the client component. */
  awardedAt: string;
  /** Internal note written by the admin who granted it. */
  note: string | null;
};

export type AdminMember = {
  id: string;
  nickname: string;
  platform: Platform;
  platformId: string | null;
  /**
   * Whether the EA identity behind the stats collection is bound. False means
   * the nickname was not found on EA yet — the collector retries every run,
   * but a wrong nickname stays pending forever, so the panel surfaces it.
   */
  statsLinked: boolean;
  /** Everything the panel needs to say whether stats are syncing. */
  sync: MemberSync;
  role: MemberRole;
  active: boolean;
  avatarUrl: string | null;
  discordId: string | null;
  /** Whether a Discord account is already linked. */
  hasAccount: boolean;
  isAdmin: boolean;
  /** The live invite, if any (used ones are not listed). */
  pendingInvite: AdminInvite | null;
  /** Medals the member holds, newest first. Drives the medal dialog. */
  awards: AdminAward[];
};

export async function getAdminMembers(): Promise<AdminMember[]> {
  const members = await db.member.findMany({
    orderBy: [{ active: "desc" }, { nickname: "asc" }],
    select: {
      id: true,
      nickname: true,
      platform: true,
      platformId: true,
      eaPersonaId: true,
      eaNucleusId: true,
      role: true,
      active: true,
      avatarUrl: true,
      discordId: true,
      collectWithoutLogin: true,
      statsPaused: true,
      statsStatus: true,
      statsCheckedAt: true,
      statsReadAt: true,
      // Only the count: "has this member ever had stats" is what separates a
      // transient failure from a member the collector genuinely cannot read.
      _count: { select: { snapshots: true } },
      profiles: { select: { isAdmin: true } },
      medals: {
        orderBy: { awardedAt: "desc" },
        select: { medalId: true, awardedAt: true, note: true },
      },
      invites: {
        where: { usedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          grantsAdmin: true,
          discordUsername: true,
          expiresAt: true,
          usedAt: true,
        },
      },
    },
  });

  return members.map((m) => {
    const input: SyncInput = { ...m, hasStats: m._count.snapshots > 0 };
    return {
      id: m.id,
      nickname: m.nickname,
      platform: m.platform,
      platformId: m.platformId,
      statsLinked: Boolean(m.eaPersonaId && m.eaNucleusId),
      sync: {
        state: syncState(input),
        checkedAt: m.statsCheckedAt?.toISOString() ?? null,
        readAt: m.statsReadAt?.toISOString() ?? null,
        lastAttemptFailed: lastAttemptFailed(input),
        canPause: m.active && (m.discordId !== null || m.collectWithoutLogin),
        paused: m.statsPaused,
      },
      role: m.role,
      active: m.active,
      avatarUrl: m.avatarUrl,
      discordId: m.discordId,
      hasAccount: m.profiles.length > 0,
      isAdmin: m.profiles.some((p) => p.isAdmin),
      pendingInvite: m.invites[0]
        ? {
            id: m.invites[0].id,
            grantsAdmin: m.invites[0].grantsAdmin,
            discordUsername: m.invites[0].discordUsername,
            expiresAt: m.invites[0].expiresAt.toISOString(),
            usedAt: null,
          }
        : null,
      awards: m.medals.map((award) => ({
        medalId: award.medalId,
        awardedAt: award.awardedAt.toISOString(),
        note: award.note,
      })),
    };
  });
}

export type AdminMedal = {
  id: string;
  name: string;
  description: string | null;
  criteria: string | null;
  tier: MedalTier;
  icon: string | null;
  imageUrl: string | null;
  /** How many members hold it — deleting the medal takes it from all of them. */
  holders: number;
};

export async function getAdminMedals(): Promise<AdminMedal[]> {
  const medals = await db.medal.findMany({
    orderBy: [{ tier: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      criteria: true,
      tier: true,
      icon: true,
      imageUrl: true,
      _count: { select: { members: true } },
    },
  });

  return medals.map((medal) => ({
    id: medal.id,
    name: medal.name,
    description: medal.description,
    criteria: medal.criteria,
    tier: medal.tier,
    icon: medal.icon,
    imageUrl: medal.imageUrl,
    holders: medal._count.members,
  }));
}

export type AdminOverview = {
  members: number;
  inactiveMembers: number;
  linkedAccounts: number;
  admins: number;
  pendingInvites: number;
  medals: number;
  /** Medals actually handed out, across all members. */
  awards: number;
};

export async function getAdminOverview(): Promise<AdminOverview> {
  const [members, inactiveMembers, linkedAccounts, admins, pendingInvites, medals, awards] =
    await Promise.all([
      db.member.count(),
      db.member.count({ where: { active: false } }),
      db.profile.count({ where: { memberId: { not: null } } }),
      db.profile.count({ where: { isAdmin: true } }),
      db.memberInvite.count({
        where: { usedAt: null, expiresAt: { gt: new Date() } },
      }),
      db.medal.count(),
      db.memberMedal.count(),
    ]);

  return {
    members,
    inactiveMembers,
    linkedAccounts,
    admins,
    pendingInvites,
    medals,
    awards,
  };
}
