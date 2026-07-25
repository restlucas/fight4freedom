// Admin reads. Deliberately NOT cached: the panel must always show the live
// state, and a stale row here means an admin acts on wrong information.

import type { MedalTier, MemberRole, Platform } from "@prisma/client";

import { db } from "@/lib/db";

export type AdminInvite = {
  id: string;
  grantsAdmin: boolean;
  discordUsername: string | null;
  expiresAt: string;
  usedAt: string | null;
};

export type AdminMember = {
  id: string;
  nickname: string;
  platform: Platform;
  platformId: string | null;
  trackerHandle: string | null;
  role: MemberRole;
  active: boolean;
  avatarUrl: string | null;
  discordId: string | null;
  /** Whether a Discord account is already linked. */
  hasAccount: boolean;
  isAdmin: boolean;
  /** The live invite, if any (used ones are not listed). */
  pendingInvite: AdminInvite | null;
};

export async function getAdminMembers(): Promise<AdminMember[]> {
  const members = await db.member.findMany({
    orderBy: [{ active: "desc" }, { nickname: "asc" }],
    select: {
      id: true,
      nickname: true,
      platform: true,
      platformId: true,
      trackerHandle: true,
      role: true,
      active: true,
      avatarUrl: true,
      discordId: true,
      profiles: { select: { isAdmin: true } },
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

  return members.map((m) => ({
    id: m.id,
    nickname: m.nickname,
    platform: m.platform,
    platformId: m.platformId,
    trackerHandle: m.trackerHandle,
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
  }));
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
};

export async function getAdminOverview(): Promise<AdminOverview> {
  const [members, inactiveMembers, linkedAccounts, admins, pendingInvites, medals] =
    await Promise.all([
      db.member.count(),
      db.member.count({ where: { active: false } }),
      db.profile.count({ where: { memberId: { not: null } } }),
      db.profile.count({ where: { isAdmin: true } }),
      db.memberInvite.count({
        where: { usedAt: null, expiresAt: { gt: new Date() } },
      }),
      db.medal.count(),
    ]);

  return {
    members,
    inactiveMembers,
    linkedAccounts,
    admins,
    pendingInvites,
    medals,
  };
}
