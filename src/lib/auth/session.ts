// Server-side authorization. THE single source of truth for access.
//
// Two rules that must not be bent:
//
//  1. Only `profile.isAdmin` grants access. `member.role` is the clan cargo
//     (member/officer/admin) and is display-only — reading it for authorization
//     would turn "edit the showcase" into "grant yourself admin".
//  2. `middleware.ts` protects navigation, NOT mutations. Every Server Action and
//     Route Handler that writes must call requireProfile/requireAdmin itself, or
//     it is open to anyone who can send a POST.
//
// Prisma connects through the pooler with a privileged role, so Supabase Row
// Level Security does not apply to our queries. Authorization is app code only.

import { cache } from "react";

import { db } from "@/lib/db";
import { publicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SessionProfile = {
  /** auth.users.id */
  id: string;
  isAdmin: boolean;
  /** Null until an invite is claimed or a discordId match links a member. */
  memberId: string | null;
  member: {
    id: string;
    nickname: string;
    avatarUrl: string | null;
  } | null;
};

/**
 * The signed-in profile, or null. Memoised per request: the header, the page and
 * any guard can all call it without repeating the round trips.
 */
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  // Auth not wired up yet (or a CI build with no secrets): the public vitrine
  // still works, nobody is signed in.
  if (!publicEnv.supabaseConfigured) return null;

  const supabase = await createSupabaseServerClient();
  // getUser() revalidates the token with Supabase; getSession() would trust
  // whatever is in the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await db.profile.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      isAdmin: true,
      memberId: true,
      member: { select: { id: true, nickname: true, avatarUrl: true } },
    },
  });
  // An auth user with no profile is signed in but not part of the clan: it has
  // no permissions at all (see the callback's decision tree).
  return profile ?? null;
});

export class UnauthorizedError extends Error {
  constructor(message = "Não autenticado") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Acesso restrito a administradores") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Requires a linked clan profile. Use in actions a member runs on themselves. */
export async function requireProfile(): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile) throw new UnauthorizedError();
  return profile;
}

/** Requires system-level admin. Use at the top of every admin mutation. */
export async function requireAdmin(): Promise<SessionProfile> {
  const profile = await requireProfile();
  if (!profile.isAdmin) throw new ForbiddenError();
  return profile;
}

/**
 * The member the signed-in user is allowed to edit. Never accept a memberId from
 * the client: that is the difference between "edit my profile" and "edit anyone's".
 */
export async function requireOwnMemberId(): Promise<string> {
  const profile = await requireProfile();
  if (!profile.memberId) {
    throw new ForbiddenError("Seu login ainda não está vinculado a um membro");
  }
  return profile.memberId;
}
