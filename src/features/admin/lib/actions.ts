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
    platformId: formData.get("platformId") ?? undefined,
    trackerHandle: formData.get("trackerHandle") ?? undefined,
    role: formData.get("role") ?? "member",
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success) {
    return actionError("Confira os campos.", fieldErrorsOf(parsed.error));
  }

  const member = await db.member.create({
    data: { ...parsed.data, joinedAt: new Date() },
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
    platformId: formData.get("platformId") ?? undefined,
    trackerHandle: formData.get("trackerHandle") ?? undefined,
    role: formData.get("role") ?? "member",
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success) {
    return actionError("Confira os campos.", fieldErrorsOf(parsed.error));
  }

  await db.member.update({
    where: { id: id.data.memberId },
    data: parsed.data,
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
    grantsAdmin:
      formData.get("grantsAdmin") === "on" ||
      formData.get("grantsAdmin") === "true",
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
