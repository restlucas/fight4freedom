"use server";

// Granting and revoking medals (the `member_medal` join table).
//
// Same rule as every admin action: requireAdmin() first, because the middleware
// only guards navigation and a POST straight to the action would otherwise go
// through.
//
// Both surfaces of the vitrine read this data — the catalog ("who earned it") and
// the member cards/profile — so every write invalidates the `medals` AND `members`
// cache tags. Missing one leaves the medal on one page and not the other for up to
// VITRINE_REVALIDATE_SECONDS.

import { requireAdmin } from "@/lib/auth/session";
import { CACHE_TAG, revalidateVitrine } from "@/lib/cache";
import { db } from "@/lib/db";

import {
  actionError,
  awardFormSchema,
  awardKeySchema,
  fieldErrorsOf,
  type ActionResult,
} from "./schemas";

export async function awardMedalAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = awardFormSchema.safeParse({
    memberId: formData.get("memberId"),
    medalId: formData.get("medalId"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) {
    return actionError("Confira os campos.", fieldErrorsOf(parsed.error));
  }

  const { memberId, medalId, note } = parsed.data;

  // Checked up front so a stale id reads as "não encontrado" instead of surfacing
  // a raw foreign key violation.
  const [member, medal] = await Promise.all([
    db.member.findUnique({ where: { id: memberId }, select: { id: true } }),
    db.medal.findUnique({ where: { id: medalId }, select: { id: true } }),
  ]);
  if (!member) return actionError("Membro não encontrado.");
  if (!medal) return actionError("Medalha não encontrada.");

  // Upsert, not create: the unique index (memberId, medalId) means a second grant
  // would throw. Rewriting the note is what an admin fixing a typo expects, and it
  // keeps the original awardedAt.
  await db.memberMedal.upsert({
    where: { memberId_medalId: { memberId, medalId } },
    create: { memberId, medalId, note, awardedBy: admin.id },
    update: { note },
  });

  revalidateVitrine(CACHE_TAG.medals, CACHE_TAG.members);
  return { ok: true, data: undefined };
}

export async function revokeMedalAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = awardKeySchema.safeParse({
    memberId: formData.get("memberId"),
    medalId: formData.get("medalId"),
  });
  if (!parsed.success) return actionError("Concessão inválida.");

  // deleteMany instead of delete: if two admins revoke the same award at once, the
  // loser gets count 0 and a clear message rather than a thrown P2025.
  const { count } = await db.memberMedal.deleteMany({ where: parsed.data });
  if (count === 0) {
    return actionError("Este membro não tem essa medalha.");
  }

  revalidateVitrine(CACHE_TAG.medals, CACHE_TAG.members);
  return { ok: true, data: undefined };
}
