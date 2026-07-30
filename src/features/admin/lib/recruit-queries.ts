// Admin reads for the candidature queue. Uncached like the rest of the panel: a stale
// row here is an admin approving someone twice.

import type { AgeBracket, Platform, RecruitStatus } from "@prisma/client";

import { db } from "@/lib/db";

export type AdminRecruit = {
  id: string;
  status: RecruitStatus;
  realName: string;
  whatsapp: string;
  nickname: string;
  platform: Platform;
  declaredEaName: string;
  declaredEaUsername: string | null;
  discordHandle: string | null;
  ageBracket: AgeBracket;
  hasGame: boolean;
  referral: string | null;
  /** ISO instant. */
  createdAt: string;
  reviewedAt: string | null;
  memberId: string | null;
  /**
   * Whether a member with this EA name already exists.
   *
   * Resolved HERE and not in the component, because it is the one thing that turns the
   * queue from a list into a decision: the same person applying twice, or applying after
   * an admin already added them by hand, is the common duplicate. Without it an admin
   * creates a second row for someone already on the roster and only finds out when the
   * collector binds both to one EA account.
   */
  existingMemberId: string | null;
};

export async function getRecruits(): Promise<AdminRecruit[]> {
  const recruits = await db.recruit.findMany({
    // Pending first, then newest: the queue is work to do, and the rest is history.
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  // One query for the whole page instead of one per row. Case-insensitive because EA's
  // own search is, so "Fulano" and "fulano" are the same account and would otherwise
  // slip past the duplicate check.
  const declared = [...new Set(recruits.map((r) => r.declaredEaName.toLowerCase()))];
  const existing =
    declared.length === 0
      ? []
      : await db.member.findMany({
          where: { eaName: { in: declared, mode: "insensitive" } },
          select: { id: true, eaName: true },
        });
  const byEaName = new Map(
    existing.flatMap((m) => (m.eaName ? [[m.eaName.toLowerCase(), m.id] as const] : [])),
  );

  return recruits.map((r) => ({
    id: r.id,
    status: r.status,
    realName: r.realName,
    whatsapp: r.whatsapp,
    nickname: r.nickname,
    platform: r.platform,
    declaredEaName: r.declaredEaName,
    declaredEaUsername: r.declaredEaUsername,
    discordHandle: r.discordHandle,
    ageBracket: r.ageBracket,
    hasGame: r.hasGame,
    referral: r.referral,
    createdAt: r.createdAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    memberId: r.memberId,
    existingMemberId: byEaName.get(r.declaredEaName.toLowerCase()) ?? null,
  }));
}

/** How many are waiting, for the badge on the panel's navigation. */
export function countPendingRecruits(): Promise<number> {
  return db.recruit.count({ where: { status: "pending" } });
}
