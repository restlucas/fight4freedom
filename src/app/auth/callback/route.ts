// Discord OAuth callback: the one place where an account is created or linked.
//
// Decision tree (agreed with the clan owner):
//
//   1. Is there an invite in this flow?  -> claim it: link the member, capture the
//      Discord id, grant admin only if the invite says so.
//   2. Does a profile already exist?     -> normal login.
//   3. Is there a member with this Discord id and no profile? -> link it.
//      Never grants admin: that is exclusive to the invite path.
//   4. Otherwise                         -> deny, sign out, no profile created.
//
// Everything here runs on the server with the identity Discord signed. Nothing is
// read from user-controlled input except the invite cookie, whose token is
// verified against a hash.

import { NextResponse } from "next/server";

import {
  INVITE_COOKIE,
  hashInviteToken,
  inviteState,
} from "@/lib/auth/invite";
import { CACHE_TAG, revalidateVitrine } from "@/lib/cache";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Only internal paths, so the callback can never become an open redirect. */
function safeRedirect(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

type Outcome = { redirectTo: string; clearInviteCookie: boolean };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeRedirect(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/entrar?erro=sem_codigo", url.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
    code,
  );
  if (exchangeError) {
    return NextResponse.redirect(new URL("/entrar?erro=falha", url.origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/entrar?erro=falha", url.origin));
  }

  // Verified identity from Discord, not from the browser.
  const identity = user.identities?.find((i) => i.provider === "discord");
  const discordId = identity?.id ?? null;
  const discordAvatar =
    typeof user.user_metadata?.avatar_url === "string"
      ? user.user_metadata.avatar_url
      : null;

  const inviteToken = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${INVITE_COOKIE}=`))
    ?.slice(INVITE_COOKIE.length + 1);

  const outcome = await resolveAccount({
    authUserId: user.id,
    discordId,
    discordAvatar,
    inviteToken: inviteToken ? decodeURIComponent(inviteToken) : null,
    next,
  });

  if (!outcome) {
    // Denied: no profile exists, so the session is worthless — drop it.
    await supabase.auth.signOut();
    const response = NextResponse.redirect(
      new URL("/entrar?erro=sem_convite", url.origin),
    );
    response.cookies.delete(INVITE_COOKIE);
    return response;
  }

  const response = NextResponse.redirect(
    new URL(outcome.redirectTo, url.origin),
  );
  if (outcome.clearInviteCookie) response.cookies.delete(INVITE_COOKIE);
  return response;
}

async function resolveAccount(params: {
  authUserId: string;
  discordId: string | null;
  discordAvatar: string | null;
  inviteToken: string | null;
  next: string;
}): Promise<Outcome | null> {
  const { authUserId, discordId, discordAvatar, inviteToken, next } = params;

  // ---- 1. Claim an invite -------------------------------------------------
  if (inviteToken) {
    const claimed = await claimInvite({
      authUserId,
      discordId,
      discordAvatar,
      tokenHash: hashInviteToken(inviteToken),
    });
    if (claimed) {
      revalidateVitrine(CACHE_TAG.members);
      return {
        redirectTo: claimed.isAdmin ? "/admin" : `/membros/${claimed.memberId}`,
        clearInviteCookie: true,
      };
    }
    // Invalid invite falls through: an existing account should still get in.
  }

  // ---- 2. Existing profile ------------------------------------------------
  const existing = await db.profile.findUnique({
    where: { id: authUserId },
    select: { isAdmin: true, memberId: true },
  });
  if (existing) {
    return { redirectTo: next, clearInviteCookie: Boolean(inviteToken) };
  }

  // ---- 3. Member pre-registered with this Discord id ----------------------
  if (discordId) {
    const member = await db.member.findFirst({
      where: { discordId, profiles: { none: {} } },
      select: { id: true, avatarUrl: true },
    });
    if (member) {
      await db.$transaction([
        db.profile.create({
          // isAdmin stays false: only an invite can grant it.
          data: { id: authUserId, memberId: member.id, isAdmin: false },
        }),
        ...(member.avatarUrl || !discordAvatar
          ? []
          : [
              db.member.update({
                where: { id: member.id },
                data: { avatarUrl: discordAvatar },
              }),
            ]),
      ]);
      revalidateVitrine(CACHE_TAG.members);
      return { redirectTo: `/membros/${member.id}`, clearInviteCookie: false };
    }
  }

  // ---- 4. Not part of the clan -------------------------------------------
  return null;
}

async function claimInvite(params: {
  authUserId: string;
  discordId: string | null;
  discordAvatar: string | null;
  tokenHash: string;
}): Promise<{ memberId: string; isAdmin: boolean } | null> {
  const { authUserId, discordId, discordAvatar, tokenHash } = params;

  const invite = await db.memberInvite.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      memberId: true,
      grantsAdmin: true,
      expiresAt: true,
      usedAt: true,
      member: { select: { avatarUrl: true, profiles: { select: { id: true } } } },
    },
  });

  if (inviteState(invite, new Date()) !== "valid" || !invite) return null;

  // Refuse if someone else already owns this member, unless it is this very
  // account re-claiming (idempotent double click).
  const owners = invite.member.profiles.map((p) => p.id);
  if (owners.length > 0 && !owners.includes(authUserId)) return null;

  try {
    return await db.$transaction(async (tx) => {
      // Atomic consume: only the first claim updates a row.
      const consumed = await tx.memberInvite.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date(), usedByProfileId: authUserId },
      });
      if (consumed.count === 0) return null;

      await tx.profile.upsert({
        where: { id: authUserId },
        create: {
          id: authUserId,
          memberId: invite.memberId,
          isAdmin: invite.grantsAdmin,
        },
        // An existing profile keeps admin it already had.
        update: {
          memberId: invite.memberId,
          ...(invite.grantsAdmin ? { isAdmin: true } : {}),
        },
      });

      await tx.member.update({
        where: { id: invite.memberId },
        data: {
          // Captured from the verified identity, which is the whole point of the
          // invite flow.
          ...(discordId ? { discordId } : {}),
          ...(invite.member.avatarUrl || !discordAvatar
            ? {}
            : { avatarUrl: discordAvatar }),
        },
      });

      return { memberId: invite.memberId, isAdmin: invite.grantsAdmin };
    });
  } catch {
    // Unique violation on discordId means that Discord account already belongs to
    // another member. Refuse rather than move the binding.
    return null;
  }
}
