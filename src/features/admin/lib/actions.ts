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
import { gametoolsProvider } from "@/lib/stats/gametools";
import { eaLookupName } from "@/lib/stats/identity";
import type { ResolvedIdentity } from "@/lib/stats/provider";

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

/**
 * Best-effort resolution of the EA identity from the EA display name (NOT the
 * clan nickname, which is cosmetic and may differ).
 *
 * Registration must never fail because a third-party API is down, so any error
 * becomes null and the scheduled collector self-heals it on the next runs
 * (src/lib/stats/collect.ts). A name matching several distinct accounts also
 * resolves to null — see pickIdentity in src/lib/stats/gametools.ts.
 */
async function resolveEaIdentity(name: string | null): Promise<ResolvedIdentity | null> {
  if (!name) return null;
  try {
    return await gametoolsProvider.searchPlayer(name);
  } catch {
    return null;
  }
}

/** The identity columns to write, or nothing when the lookup did not resolve. */
function identityData(identity: ResolvedIdentity | null) {
  if (!identity) return {};
  return {
    eaPersonaId: identity.personaId,
    eaNucleusId: identity.nucleusId,
    eaUsername: identity.username,
  };
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
    platformId: formData.get("platformId") ?? undefined,
    role: formData.get("role") ?? "member",
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success) {
    return actionError("Confira os campos.", fieldErrorsOf(parsed.error));
  }

  const identity = await resolveEaIdentity(eaLookupName(parsed.data));
  const member = await db.member.create({
    data: {
      ...parsed.data,
      ...identityData(identity),
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
    platformId: formData.get("platformId") ?? undefined,
    role: formData.get("role") ?? "member",
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success) {
    return actionError("Confira os campos.", fieldErrorsOf(parsed.error));
  }

  const current = await db.member.findUnique({
    where: { id: id.data.memberId },
    select: { eaName: true, platformId: true, eaPersonaId: true, eaNucleusId: true },
  });
  if (!current) return actionError("Membro não encontrado.");

  // Re-resolve the EA identity when the name we look up by changed or was never
  // bound. Renaming the clan nickname does NOT trigger a lookup — it is cosmetic.
  // On failure the old ids are KEPT on purpose: EA ids survive account renames,
  // so a member who renamed keeps collecting; a typo fix gets rebound as soon
  // as the search succeeds (here or in the collector).
  let identity: ResolvedIdentity | null = null;
  const needsResolution =
    eaLookupName(current) !== eaLookupName(parsed.data) ||
    !current.eaPersonaId ||
    !current.eaNucleusId;
  if (needsResolution) {
    identity = await resolveEaIdentity(eaLookupName(parsed.data));
  }

  await db.member.update({
    where: { id: id.data.memberId },
    data: {
      ...parsed.data,
      ...identityData(identity),
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
