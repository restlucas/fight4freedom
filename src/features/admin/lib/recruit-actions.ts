"use server";

// Working the candidature queue: approve into a member, or reject.
//
// APPROVING IS A FLOW, NOT AN INSERT, and that is the whole value of the queue. It does
// three things the public endpoint deliberately cannot: creates the member, resolves the
// EA identity from the name the CANDIDATE typed, and leaves the candidature pointing at
// the row it produced so the roster can always answer where a member came from.
//
// The EA name being the candidate's own string is the point. Every member created this
// way starts with a name the person who owns the account gave us, instead of an admin's
// guess — which is the origin of the 23 members bound to no EA account at all.

import { z } from "zod";

import { actionError, type ActionResult } from "@/lib/action-result";
import { requireAdmin } from "@/lib/auth/session";
import { CACHE_TAG, revalidateVitrine } from "@/lib/cache";
import { db } from "@/lib/db";

import { eaLookupName } from "@/lib/stats/identity";

import { identityData, platformIdFrom, resolveEaIdentity } from "./member-identity";

const recruitIdSchema = z.object({ recruitId: z.string().uuid("Candidatura inválida") });

export async function approveRecruitAction(
  _prev: ActionResult<{ memberId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ memberId: string }>> {
  const admin = await requireAdmin();

  const parsed = recruitIdSchema.safeParse({ recruitId: formData.get("recruitId") });
  if (!parsed.success) return actionError("Candidatura inválida.");

  const recruit = await db.recruit.findUnique({ where: { id: parsed.data.recruitId } });
  if (!recruit) return actionError("Candidatura não encontrada.");
  // Not an error worth a stack trace, but worth refusing: two admins working the queue at
  // once must not create the same member twice.
  if (recruit.status !== "pending") {
    return actionError("Essa candidatura já foi resolvida.");
  }

  const platformId = platformIdFrom(recruit.nickname);
  // Resolved from the CANDIDATE's own string. A failure here is not fatal: the member is
  // created unbound and the collector keeps retrying, which is exactly how a member added
  // by hand behaves.
  const identity = await resolveEaIdentity(
    eaLookupName({ eaName: recruit.declaredEaName, platformId }),
    recruit.declaredEaUsername,
  );

  const member = await db.$transaction(async (tx) => {
    const created = await tx.member.create({
      data: {
        nickname: recruit.nickname,
        platform: recruit.platform,
        platformId,
        eaName: recruit.declaredEaName,
        eaUsername: recruit.declaredEaUsername,
        ...identityData(identity, recruit.declaredEaUsername),
        role: "member",
        active: true,
        joinedAt: new Date(),
      },
      select: { id: true },
    });

    await tx.recruit.update({
      where: { id: recruit.id },
      data: {
        status: "approved",
        reviewedBy: admin.id,
        reviewedAt: new Date(),
        memberId: created.id,
      },
    });

    return created;
  });

  revalidateVitrine(CACHE_TAG.members);
  return { ok: true, data: { memberId: member.id } };
}

export async function rejectRecruitAction(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  const admin = await requireAdmin();

  const parsed = recruitIdSchema.safeParse({ recruitId: formData.get("recruitId") });
  if (!parsed.success) return actionError("Candidatura inválida.");

  // Marked, never deleted. The row is the only record that someone applied, and "we said
  // no in March" is an answer the clan will want when they apply again in June.
  const { count } = await db.recruit.updateMany({
    where: { id: parsed.data.recruitId, status: "pending" },
    data: { status: "rejected", reviewedBy: admin.id, reviewedAt: new Date() },
  });
  if (count === 0) return actionError("Essa candidatura já foi resolvida.");

  return { ok: true, data: undefined };
}

/**
 * Puts a rejected candidature back in the queue.
 *
 * Exists because "recusada" is sometimes a mistake and sometimes a change of mind: the
 * clan tells someone to come back after they buy the game, and when they do, the answers
 * they already gave are the ones worth keeping. Re-opening beats asking them to fill the
 * form again.
 *
 * Clears the review stamps, so a re-opened row is indistinguishable from a fresh one and
 * the queue's ordering does not treat it as already handled.
 */
export async function reopenRecruitAction(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  await requireAdmin();

  const parsed = recruitIdSchema.safeParse({ recruitId: formData.get("recruitId") });
  if (!parsed.success) return actionError("Candidatura inválida.");

  // Only from `rejected`. An APPROVED one already produced a member, and re-opening that
  // would invite a second one for the same person.
  const { count } = await db.recruit.updateMany({
    where: { id: parsed.data.recruitId, status: "rejected" },
    data: { status: "pending", reviewedBy: null, reviewedAt: null },
  });
  if (count === 0) {
    return actionError("Só é possível retomar uma candidatura recusada.");
  }

  return { ok: true, data: undefined };
}

/**
 * Deletes a rejected candidature for good.
 *
 * ONLY FROM `rejected`, and that guard is the whole safety design here. Rejecting is the
 * reversible step and it is what the queue does by default; deleting is for the rows that
 * should not have existed at all — spam, a duplicate, a test submission. An approved
 * candidature is the only record of where a roster member came from, so it is never
 * deletable through this path.
 *
 * No typed confirmation, unlike deleting a member: what is lost is one application's
 * answers, not a season of stats, and a confirmation heavier than the damage is a
 * confirmation people learn to click through.
 */
export async function deleteRecruitAction(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  await requireAdmin();

  const parsed = recruitIdSchema.safeParse({ recruitId: formData.get("recruitId") });
  if (!parsed.success) return actionError("Candidatura inválida.");

  const { count } = await db.recruit.deleteMany({
    where: { id: parsed.data.recruitId, status: "rejected" },
  });
  if (count === 0) {
    return actionError("Só é possível excluir uma candidatura recusada.");
  }

  return { ok: true, data: undefined };
}
