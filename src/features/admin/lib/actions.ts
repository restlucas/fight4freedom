"use server";

// Admin mutations. Every one of them starts with requireAdmin(): the middleware
// only guards navigation, so without this an anonymous POST straight to the
// action would go through (see src/lib/auth/session.ts).

import { getRequestOrigin } from "@/lib/app-url";
import { requireAdmin } from "@/lib/auth/session";
import {
  generateInviteToken,
  hashInviteToken,
  inviteExpiresAt,
  inviteUrl,
} from "@/lib/auth/invite";
import { CACHE_TAG, revalidateVitrine } from "@/lib/cache";
import { db } from "@/lib/db";
import { eaLookupName } from "@/lib/stats/identity";
import type { ResolvedIdentity } from "@/lib/stats/provider";

// Moved out of this file so `./recruit-actions.ts` can use them too: a `"use server"`
// module may only export async functions, so two of the three were unexportable here.
import { identityData, platformIdFrom, resolveEaIdentity } from "./member-identity";

import {
  actionError,
  inviteFormSchema,
  inviteIdSchema,
  memberFormSchema,
  memberIdSchema,
  type ActionResult,
} from "./schemas";

/** Turns a ZodError into the field map the forms render. */
function fieldErrorsOf(error: {
  issues: { path: (string | number | symbol)[]; message: string }[];
}): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    map[key] = [...(map[key] ?? []), issue.message];
  }
  return map;
}

export async function createMemberAction(
  _prev: ActionResult<{ memberId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ memberId: string }>> {
  await requireAdmin();

  const parsed = memberFormSchema.safeParse({
    nickname: formData.get("nickname"),
    platform: formData.get("platform"),
    eaName: formData.get("eaName") ?? undefined,
    eaUsername: formData.get("eaUsername") ?? undefined,
    role: formData.get("role") ?? "member",
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success) {
    return actionError("Confira os campos.", fieldErrorsOf(parsed.error));
  }

  const platformId = platformIdFrom(parsed.data.nickname);
  const identity = await resolveEaIdentity(
    eaLookupName({ ...parsed.data, platformId }),
    parsed.data.eaUsername,
  );
  const member = await db.member.create({
    data: {
      ...parsed.data,
      platformId,
      ...identityData(identity, parsed.data.eaUsername),
      joinedAt: new Date(),
    },
    select: { id: true },
  });

  revalidateVitrine(CACHE_TAG.members);
  return { ok: true, data: { memberId: member.id } };
}

export async function updateMemberAction(
  _prev: ActionResult<{ memberId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ memberId: string }>> {
  await requireAdmin();

  const id = memberIdSchema.safeParse({ memberId: formData.get("memberId") });
  if (!id.success) return actionError("Membro inválido.");

  const parsed = memberFormSchema.safeParse({
    nickname: formData.get("nickname"),
    platform: formData.get("platform"),
    eaName: formData.get("eaName") ?? undefined,
    eaUsername: formData.get("eaUsername") ?? undefined,
    role: formData.get("role") ?? "member",
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success) {
    return actionError("Confira os campos.", fieldErrorsOf(parsed.error));
  }

  const current = await db.member.findUnique({
    where: { id: id.data.memberId },
    select: {
      eaName: true,
      platformId: true,
      eaPersonaId: true,
      eaNucleusId: true,
      identityConfirmedAt: true,
    },
  });
  if (!current) return actionError("Membro não encontrado.");

  const platformId = platformIdFrom(parsed.data.nickname);

  // Re-resolve the EA identity when the name we look up by changed or was never
  // bound. Renaming the clan nickname does NOT trigger a lookup — it is cosmetic.
  // On failure the old ids are KEPT on purpose: EA ids survive account renames,
  // so a member who renamed keeps collecting; a typo fix gets rebound as soon
  // as the search succeeds (here or in the collector).
  let identity: ResolvedIdentity | null = null;
  const lookup = eaLookupName({ ...parsed.data, platformId });
  const needsResolution =
    eaLookupName(current) !== lookup || !current.eaPersonaId || !current.eaNucleusId;
  if (needsResolution) {
    identity = await resolveEaIdentity(lookup, parsed.data.eaUsername);
  }

  // An admin moving a member to a DIFFERENT EA account invalidates the member's
  // confirmation, which sends them back through /confirmar-conta on their next
  // visit. Correct rather than annoying: what the member agreed to was the old
  // account, and that agreement says nothing about this one — re-asking is the
  // whole point of having the column (see the schema comment).
  //
  // Only a genuine ACCOUNT change counts. A re-resolution that lands on the same
  // nucleus id (a rename, a different persona of the same account) keeps it.
  const reboundToAnotherAccount = Boolean(
    identity && current.eaNucleusId && identity.nucleusId !== current.eaNucleusId,
  );

  await db.member.update({
    where: { id: id.data.memberId },
    data: {
      ...parsed.data,
      platformId,
      ...identityData(identity, parsed.data.eaUsername),
      ...(reboundToAnotherAccount ? { identityConfirmedAt: null } : {}),
    },
  });

  revalidateVitrine(CACHE_TAG.members, CACHE_TAG.stats);
  return { ok: true, data: { memberId: id.data.memberId } };
}

/**
 * Creates the invite link. The plaintext token is returned once, here, and never
 * stored — only its hash goes to the database.
 */
export async function createInviteAction(
  _prev: ActionResult<{ url: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const admin = await requireAdmin();

  const parsed = inviteFormSchema.safeParse({
    memberId: formData.get("memberId"),
    discordUsername: formData.get("discordUsername") ?? undefined,
    grantsAdmin: formData.get("grantsAdmin") === "on" || formData.get("grantsAdmin") === "true",
  });
  if (!parsed.success) {
    return actionError("Confira os campos.", fieldErrorsOf(parsed.error));
  }

  const member = await db.member.findUnique({
    where: { id: parsed.data.memberId },
    select: { id: true, profiles: { select: { id: true } } },
  });
  if (!member) return actionError("Membro não encontrado.");
  // A member with an account does not need an invite, and a second one would let
  // two Discord accounts control the same member.
  if (member.profiles.length > 0) {
    return actionError("Esse membro já tem uma conta vinculada.");
  }

  const token = generateInviteToken();
  await db.$transaction([
    // Only one live invite per member: a new link supersedes the old one.
    db.memberInvite.deleteMany({
      where: { memberId: member.id, usedAt: null },
    }),
    db.memberInvite.create({
      data: {
        memberId: member.id,
        tokenHash: hashInviteToken(token),
        grantsAdmin: parsed.data.grantsAdmin,
        discordUsername: parsed.data.discordUsername,
        expiresAt: inviteExpiresAt(new Date()),
        createdBy: admin.id,
      },
    }),
  ]);

  // Built from the request origin, so the link always points at the deployment
  // the admin is actually using (production, preview or local).
  return { ok: true, data: { url: inviteUrl(await getRequestOrigin(), token) } };
}

export async function revokeInviteAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = inviteIdSchema.safeParse({
    inviteId: formData.get("inviteId"),
  });
  if (!parsed.success) return actionError("Convite inválido.");

  // Only unused invites can be revoked; a consumed one is history.
  await db.memberInvite.deleteMany({
    where: { id: parsed.data.inviteId, usedAt: null },
  });

  return { ok: true, data: undefined };
}

/**
 * Takes a member out of the stats collection, or puts them back.
 *
 * Exists because the honest alternative was worse: to stop the collector from
 * burning requests on a member whose platform id is wrong, an admin would have
 * had to set `active = false`, which also removes them from /membros and from
 * the ranking — punishing the member for a data-entry problem.
 *
 * Purges the vitrine cache because a paused member stops accruing snapshots, and
 * the ranking is derived from those.
 */
export async function toggleMemberStatsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = memberIdSchema.safeParse({ memberId: formData.get("memberId") });
  if (!parsed.success) return actionError("Membro inválido.");

  const paused = formData.get("paused") === "true";

  // updateMany, not update: a member deleted between the page render and this
  // submit should be a no-op, not a thrown "record not found".
  const { count } = await db.member.updateMany({
    where: { id: parsed.data.memberId },
    data: { statsPaused: paused },
  });
  if (count === 0) return actionError("Membro não encontrado.");

  revalidateVitrine(CACHE_TAG.members);
  return { ok: true, data: undefined };
}

/**
 * Deletes a member and everything attached to them. IRREVERSIBLE.
 *
 * The clan owner asked for a real delete rather than a deactivation (2026-07-29),
 * knowing what it costs, so the safety is not in refusing it — it is in making the
 * cost impossible to miss and the trigger impossible to hit by accident.
 *
 * WHAT GOES WITH THEM, by the cascades in prisma/schema.prisma:
 *
 *   stat_snapshot     the entire stats history, which is the ranking's raw material
 *   member_medal      every medal awarded to them
 *   clan_event        their sessions and promotions, so the activity feed loses them
 *   member_top_item   weapon, mode, map
 *   identity_claim    including the record of what they typed, which is the evidence
 *                     an admin uses to fix a name
 *   member_invite     any pending invite
 *
 * `profile.memberId` and `highlight.memberId` are SetNull, so a Discord login
 * survives the delete unlinked rather than being destroyed with the member.
 *
 * THE TYPED NICKNAME IS CHECKED HERE, not only in the dialog. A confirmation that
 * lives in the client is a confirmation a crafted POST skips, and this is the one
 * action in the panel with no undo. There is no backup to restore from.
 *
 * Deactivating (`active: false`) remains the reversible path and is still the right
 * one for a member who left: it takes them off the vitrine and out of the ranking
 * while keeping the history that their seasons are made of.
 */
export async function deleteMemberAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = memberIdSchema.safeParse({ memberId: formData.get("memberId") });
  if (!parsed.success) return actionError("Membro inválido.");

  const member = await db.member.findUnique({
    where: { id: parsed.data.memberId },
    select: { nickname: true },
  });
  if (!member) return actionError("Membro não encontrado.");

  // Compared against what the DATABASE says the nickname is, never against a value
  // that travelled with the form: otherwise the confirmation is the attacker's own
  // string matching itself.
  const confirmation = (formData.get("confirmation")?.toString() ?? "").trim();
  if (confirmation !== member.nickname) {
    return actionError(`Digite exatamente "${member.nickname}" para confirmar a exclusão.`);
  }

  await db.member.delete({ where: { id: parsed.data.memberId } });

  // Every tag: the member leaves /membros and /ranking, and their medals stop being
  // counted in the catalogue's holders.
  revalidateVitrine(CACHE_TAG.members, CACHE_TAG.stats, CACHE_TAG.medals);
  return { ok: true, data: undefined };
}
