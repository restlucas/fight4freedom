// Reads for the identity screen. Server-only.

import { db } from "@/lib/db";
import { gametoolsProvider } from "@/lib/stats/gametools";
import type { IdentityCard } from "@/lib/stats/provider";

/** Everything /confirmar-conta needs, in one read. */
export type IdentityState = {
  memberId: string;
  nickname: string;
  /** Already settled: the screen turns into a read-only receipt. */
  confirmedAt: Date | null;
  helpRequestedAt: Date | null;
  /**
   * The account bound right now, with its card — the "just confirm what we
   * already have" path. Null both when nothing is bound AND when the source could
   * not be read; `boundIdentityExists` tells those apart, because they need
   * opposite screens (a form versus a retry).
   */
  boundCard: IdentityCard | null;
  boundIdentityExists: boolean;
  /**
   * Newest snapshot's timestamp: the closest thing to "last activity" that exists
   * anywhere. The EA payload has NO date field of any kind (verified 2026-07-29
   * by walking both endpoints), so this is our own observation — a snapshot is
   * only written when counters moved, which means it marks real play.
   *
   * Null means "we have never recorded this account playing", NOT "never played".
   */
  lastPlayedAt: Date | null;
  /** Last attempt, to prefill the form so a retry is one keystroke, not two fields. */
  lastClaim: { declaredName: string; declaredUsername: string } | null;
};

export async function getIdentityState(memberId: string): Promise<IdentityState | null> {
  const member = await db.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      nickname: true,
      eaName: true,
      eaUsername: true,
      eaPersonaId: true,
      eaNucleusId: true,
      identityConfirmedAt: true,
      identityHelpRequestedAt: true,
      snapshots: {
        orderBy: { capturedAt: "desc" },
        take: 1,
        select: { capturedAt: true },
      },
      identityClaims: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { declaredName: true, declaredUsername: true },
      },
    },
  });
  if (!member) return null;

  const boundIdentityExists = Boolean(member.eaPersonaId && member.eaNucleusId);
  const boundCard =
    boundIdentityExists && member.eaPersonaId && member.eaNucleusId
      ? await gametoolsProvider.fetchIdentityCard({
          personaId: member.eaPersonaId,
          nucleusId: member.eaNucleusId,
          username: member.eaUsername,
        })
      : null;

  return {
    memberId: member.id,
    nickname: member.nickname,
    confirmedAt: member.identityConfirmedAt,
    helpRequestedAt: member.identityHelpRequestedAt,
    boundCard,
    boundIdentityExists,
    lastPlayedAt: member.snapshots[0]?.capturedAt ?? null,
    // Prefill order: what they last typed, then what an admin registered. The
    // admin's guess is a worse starting point but far better than an empty field,
    // and for the 72 members whose binding already works it is exactly right.
    lastClaim: member.identityClaims[0] ?? {
      declaredName: member.eaName ?? "",
      declaredUsername: member.eaUsername ?? "",
    },
  };
}
