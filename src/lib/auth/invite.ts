// Invite tokens for binding a Discord account to a member.
//
// The plaintext token exists only in the link the admin copies. The database
// stores its SHA-256, so a database leak cannot be turned into account takeover
// — the same reason password reset tokens are hashed.

import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes: far beyond guessable, and URL-safe once encoded. */
const TOKEN_BYTES = 32;

export const INVITE_TTL_DAYS = 7;

/** Cookie that carries the token across the Discord round trip. */
export const INVITE_COOKIE = "f4f_invite";

export function generateInviteToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteExpiresAt(from: Date): Date {
  return new Date(from.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Absolute URL an admin shares with the invited member. */
export function inviteUrl(appUrl: string, token: string): string {
  return new URL(`/convite/${token}`, appUrl).toString();
}

export type InviteRecord = {
  expiresAt: Date;
  usedAt: Date | null;
};

export type InviteState = "valid" | "used" | "expired" | "unknown";

/**
 * Why an invite cannot be claimed, if it cannot. Kept pure so every rule is
 * covered by tests instead of being buried in the callback.
 */
export function inviteState(invite: InviteRecord | null, now: Date): InviteState {
  if (!invite) return "unknown";
  if (invite.usedAt) return "used";
  if (invite.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}

export const INVITE_STATE_MESSAGE: Record<Exclude<InviteState, "valid">, string> = {
  used: "Este convite já foi utilizado.",
  expired: "Este convite expirou. Peça um novo a um oficial.",
  unknown: "Convite não encontrado.",
};
