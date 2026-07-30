// Admin reads. Deliberately NOT cached: the panel must always show the live
// state, and a stale row here means an admin acts on wrong information.

import type { MedalTier, MemberRole, Platform, StatsSyncStatus } from "@prisma/client";

import { db } from "@/lib/db";

// Thresholds live in ./member-activity.ts, not here, and the direction of that import
// is load-bearing: this module imports the db, so anything a CLIENT component reads as
// a VALUE from here drags Prisma into the browser bundle. The labels module needs the
// numbers to write "7+ dias" on a badge, so the numbers have to live on the side that
// is safe to import. It only takes a TYPE back from here, which the compiler erases.
import { ACTIVITY_ABSENT_DAYS, ACTIVITY_AT_RISK_DAYS } from "./member-activity";

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
  /** Last attempt found no BF6 data, but earlier ones did — see `no_data`. */
  | "no_data"
  /** No attempt has EVER worked. Almost always the wrong EA account. */
  | "never_read"
  /** No EA identity: the platform id matches no EA account. */
  | "identity_pending"
  /**
   * The member tried to identify their own EA account on /confirmar-conta, could
   * not, and asked for help. The only state a MEMBER can put themselves into, and
   * the only one carrying a request rather than a symptom.
   */
  | "help_requested";

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
  /** ISO instant the member asked an admin to sort their EA account out. */
  helpRequestedAt: string | null;
  /**
   * Why the collection is paused, when anything wrote a reason. Surfaced next to
   * the badge because "Pausado" alone never said whether a human decided it or a
   * member got stuck.
   */
  pausedReason: string | null;
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
  /** When a read last WORKED. Null means not once, ever. */
  statsReadAt: Date | null;
  /** Set when the member gave up on /confirmar-conta and asked for help. */
  identityHelpRequestedAt: Date | null;
};

function syncState(m: SyncInput): MemberSyncState {
  const eligible = m.active && (m.discordId !== null || m.collectWithoutLogin);
  if (!eligible) return "off";
  // BEFORE `paused`, and that order is the point: asking for help is what pauses a
  // member who has nothing bound, so checking `statsPaused` first would relabel
  // every request as a routine admin pause and hide the queue completely.
  if (m.identityHelpRequestedAt != null) return "help_requested";
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
  if (m.statsStatus === "no_data") {
    if (m.hasStats) return "ok";
    // NEVER read successfully, not once. Split out on 2026-07-28 because it is a
    // different problem with a different fix, and lumping the two hid it: four
    // members had been failing every cycle since they were registered, wearing the
    // same badge as members whose batch merely 504'd that round. Investigating
    // them found the cause — `eaName` bound to a coincidentally-named EA account
    // with no BF6 data — and one was fixed by correcting the name alone
    // (`Bravo_six762` → `F4F WISLAN`, an account with 836 matches).
    //
    // `statsReadAt` is the honest test for "has this ever worked", and unlike
    // `hasStats` it does not need the member to have played: a successful read of
    // an idle member moves it and writes no snapshot.
    if (m.statsReadAt === null) return "never_read";
    return "no_data";
  }
  if (m.statsStatus === "identity_pending" || !m.eaPersonaId) return "identity_pending";
  return "waiting";
}

/** True only when the badge is healthy BECAUSE of history, not this attempt. */
function lastAttemptFailed(m: SyncInput): boolean {
  return syncState(m) === "ok" && m.statsStatus === "no_data";
}

/**
 * Whether a member is still playing, as far as we can see.
 *
 * A DIFFERENT QUESTION FROM `MemberSyncState`, and keeping them apart is the whole
 * point of this type. That one answers "did our reading work"; this one answers "is
 * this person still here". They come apart constantly: a member read successfully
 * every single cycle for three weeks without playing once shows a healthy green sync
 * badge, because the collection is working perfectly and there is simply nothing new
 * to record.
 *
 * The signal for playing is the age of the newest SNAPSHOT, never `statsReadAt`: a
 * snapshot is only written when the counters moved, so its date is the last time the
 * member actually played. `statsReadAt` moves on every successful fetch, idle member
 * or not.
 */
export type MemberActivityState =
  /**
   * The collector cannot answer for this member: not eligible, paused, or bound to
   * an EA account it has never managed to read. Action is on the RECORD, not on the
   * person, and mixing this with "does not play" is what would make an admin chase
   * someone who is waiting on a fix. Same rule as the identity card's null in
   * docs/api-gametools.md §12: null means "we did not observe", never "never played".
   */
  | "unknown"
  /**
   * Read fine, and we have never once recorded them playing. Distinct from `absent`
   * because the cause is ambiguous: they may not play, or they may have stopped
   * before collection existed (27/07). Resolves itself the moment they play.
   */
  | "never_seen"
  /** Played within the risk threshold. Nothing to do. */
  | "playing"
  /** Quiet for a week. Worth a message before it becomes a departure. */
  | "at_risk"
  /** Quiet for two weeks. */
  | "absent";

export type MemberActivity = {
  state: MemberActivityState;
  /**
   * ISO instant of the newest snapshot: the last time we saw this member play. Null
   * when we never have.
   */
  lastPlayedAt: string | null;
  /** Whole days since then. Null when there is no snapshot to count from. */
  daysSince: number | null;
};

/** How much history a delete would take with it. Read by the confirmation dialog. */
export type MemberHistory = {
  snapshots: number;
  events: number;
  medals: number;
};

type ActivityInput = SyncInput & {
  /** Newest snapshot, or null. */
  lastPlayedAt: Date | null;
};

function memberActivity(m: ActivityInput, now: Date): MemberActivity {
  const state = syncState(m);
  // Everything the collector cannot see through: an inactive or ineligible member, a
  // paused one, a missing identity, or an account no read has ever worked on.
  if (state === "off" || state === "paused" || state === "identity_pending") {
    return { state: "unknown", lastPlayedAt: null, daysSince: null };
  }
  if (state === "never_read" || state === "help_requested") {
    return { state: "unknown", lastPlayedAt: null, daysSince: null };
  }

  if (m.lastPlayedAt === null) {
    return { state: "never_seen", lastPlayedAt: null, daysSince: null };
  }

  const daysSince = Math.floor((now.getTime() - m.lastPlayedAt.getTime()) / 86_400_000);
  return {
    state:
      daysSince >= ACTIVITY_ABSENT_DAYS
        ? "absent"
        : daysSince >= ACTIVITY_AT_RISK_DAYS
          ? "at_risk"
          : "playing",
    lastPlayedAt: m.lastPlayedAt.toISOString(),
    daysSince,
  };
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
  /** EA display name the collector looks the member up by. Null = not informed. */
  eaName: string | null;
  /** EA username of the bound account. Distinguishes same-named accounts only. */
  eaUsername: string | null;
  /**
   * Whether the EA identity behind the stats collection is bound. False means
   * the EA name was not found yet — the collector retries every run, but a wrong
   * or missing name stays pending forever, so the panel surfaces it.
   */
  statsLinked: boolean;
  /** Everything the panel needs to say whether stats are syncing. */
  sync: MemberSync;
  /**
   * Whether the member is still playing. NOT the same question as `sync`, which is
   * about whether our reading works — see MemberActivityState.
   */
  activity: MemberActivity;
  /** How much history a delete would destroy. Read by the confirmation dialog. */
  history: MemberHistory;
  role: MemberRole;
  active: boolean;
  /**
   * When the member joined the clan, as an ISO instant.
   *
   * A DATE-ONLY column (`@db.Date`), so it must be formatted in UTC: rendering it in
   * a negative timezone shows the day before, and this is the one field in the table
   * an admin might cross-check against a spreadsheet.
   */
  joinedAt: string | null;
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
      eaName: true,
      eaUsername: true,
      eaPersonaId: true,
      eaNucleusId: true,
      role: true,
      active: true,
      joinedAt: true,
      avatarUrl: true,
      discordId: true,
      collectWithoutLogin: true,
      statsPaused: true,
      statsPausedReason: true,
      statsStatus: true,
      statsCheckedAt: true,
      statsReadAt: true,
      identityHelpRequestedAt: true,
      // Counts, for two different jobs. `snapshots` answers "has this member ever
      // had stats", which separates a transient failure from a member the collector
      // genuinely cannot read. Both feed the delete dialog, which has to say what it
      // is about to destroy.
      _count: { select: { snapshots: true, events: true } },
      // Newest snapshot only: its date is the last time the member PLAYED, because a
      // snapshot is written only when the counters moved. One row per member.
      snapshots: { orderBy: { capturedAt: "desc" }, take: 1, select: { capturedAt: true } },
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

  // One instant for the whole page, so two rows can never disagree about what "today"
  // is. This query is deliberately uncached (see the file header), so reading the
  // clock here is safe — a cached query would freeze it.
  const now = new Date();

  return members.map((m) => {
    const input: SyncInput = { ...m, hasStats: m._count.snapshots > 0 };
    return {
      id: m.id,
      nickname: m.nickname,
      platform: m.platform,
      platformId: m.platformId,
      eaName: m.eaName,
      eaUsername: m.eaUsername,
      statsLinked: Boolean(m.eaPersonaId && m.eaNucleusId),
      sync: {
        state: syncState(input),
        checkedAt: m.statsCheckedAt?.toISOString() ?? null,
        readAt: m.statsReadAt?.toISOString() ?? null,
        lastAttemptFailed: lastAttemptFailed(input),
        canPause: m.active && (m.discordId !== null || m.collectWithoutLogin),
        paused: m.statsPaused,
        helpRequestedAt: m.identityHelpRequestedAt?.toISOString() ?? null,
        pausedReason: m.statsPausedReason,
      },
      activity: memberActivity({ ...input, lastPlayedAt: m.snapshots[0]?.capturedAt ?? null }, now),
      history: {
        snapshots: m._count.snapshots,
        events: m._count.events,
        medals: m.medals.length,
      },
      role: m.role,
      active: m.active,
      joinedAt: m.joinedAt?.toISOString() ?? null,
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
