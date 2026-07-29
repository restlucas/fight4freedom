"use server";

// The member's own profile edits.
//
// SCOPE IS ONE FIELD, and that is a decision rather than a starting point (clan
// owner, 2026-07-29). `nickname`, `platform`, `eaName` and the two EA ids stay as
// admin writes: they are collection and identity keys, and a member who confirmed
// their account must not be able to unbind it, which is the one-way door of
// docs/api-gametools.md §12.
//
// THE GUARD IS THIS ACTION, NOT THE DATABASE. Row Level Security is on for every
// table since 2026-07-29, but Prisma connects through the pooler with a privileged
// role, so no policy applies to our queries (see src/lib/auth/session.ts). This is
// the first write to `member` performed by someone who is not an admin, so it is
// worth saying out loud instead of leaving for whoever reads the schema and assumes
// RLS is holding the line here.
//
// `requireOwnMemberId` takes the member from the SESSION and never from the form,
// which is the whole difference between "edit my bio" and "edit anyone's".

import { actionError, fieldErrorsOf, type ActionResult } from "@/lib/action-result";
import { requireOwnMemberId } from "@/lib/auth/session";
import { CACHE_TAG, revalidateVitrine } from "@/lib/cache";
import { db } from "@/lib/db";

import { bioSchema } from "./schemas";

export async function updateBioAction(
  _prev: ActionResult<{ bio: string | null }> | null,
  formData: FormData,
): Promise<ActionResult<{ bio: string | null }>> {
  const memberId = await requireOwnMemberId();

  // A missing field means an empty bio, which means removing it. Reading it as
  // absent input instead would make "I cleared my bio" fail validation.
  const parsed = bioSchema.safeParse({ bio: formData.get("bio")?.toString() ?? "" });
  if (!parsed.success) {
    return actionError("Confira o texto.", fieldErrorsOf(parsed.error));
  }

  await db.member.update({
    where: { id: memberId },
    data: { bio: parsed.data.bio },
  });

  // Purges `getMemberProfile` for everyone else. Without it the edit would wait out
  // its 300 s TTL, which is half of every "editei e não mudou" (item 7 do Backlog
  // técnico).
  //
  // No `revalidatePath` alongside it: /membros/[id] is `force-dynamic`, so there is
  // no page cache to drop, and the member who just wrote sees their own value from
  // the action's return rather than from a re-render.
  revalidateVitrine(CACHE_TAG.members);

  return { ok: true, data: { bio: parsed.data.bio } };
}
