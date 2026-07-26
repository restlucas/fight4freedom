// Validation for every admin write. Lives on the server because that is the
// security boundary: the client can be bypassed with a crafted POST, so these
// rules run in the Server Action regardless of what the form did.

import { z } from "zod";

export const PLATFORMS = ["ea", "xbox", "psn"] as const;
export const MEMBER_ROLES = ["member", "officer", "admin"] as const;

const trimmedOptional = z
  .string()
  .trim()
  .max(80)
  .optional()
  .transform((value) => (value ? value : null));

export const memberFormSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(2, "Informe o nick com pelo menos 2 caracteres")
    .max(32, "O nick deve ter no máximo 32 caracteres"),
  platform: z.enum(PLATFORMS, { message: "Escolha uma plataforma" }),
  platformId: trimmedOptional,
  /** Clan cargo. Display only — never grants access (see lib/auth/session.ts). */
  role: z.enum(MEMBER_ROLES),
  active: z.coerce.boolean(),
});

export type MemberFormInput = z.input<typeof memberFormSchema>;
export type MemberFormValues = z.output<typeof memberFormSchema>;

export const inviteFormSchema = z.object({
  memberId: z.string().uuid("Membro inválido"),
  /** Label so the admin remembers who the link was for; never authorization. */
  discordUsername: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((value) => (value ? value : null)),
  grantsAdmin: z.coerce.boolean(),
});

export const MEDAL_TIERS = ["common", "rare", "legendary", "special"] as const;

/** Curated lucide names, matching ICONS in medal-emblem.tsx. */
export const MEDAL_ICONS = ["crosshair", "shield", "swords", "crown", "trophy", "star"] as const;

const longTextOptional = z
  .string()
  .trim()
  .max(280)
  .optional()
  .transform((value) => (value ? value : null));

export const medalFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome com pelo menos 2 caracteres")
    // The catalog card clamps the name to one line; longer than this is cut.
    .max(24, "O nome deve ter no máximo 24 caracteres"),
  description: longTextOptional,
  criteria: longTextOptional,
  tier: z.enum(MEDAL_TIERS, { message: "Escolha uma raridade" }),
  /** Fallback shown until artwork is uploaded. */
  icon: z.enum(MEDAL_ICONS).optional().default("crosshair"),
});

export const medalIdSchema = z.object({
  medalId: z.string().uuid("Medalha inválida"),
});

export const memberIdSchema = z.object({
  memberId: z.string().uuid("Membro inválido"),
});

/**
 * Granting a medal. The pair (memberId, medalId) is the natural key — the table
 * has a unique index on it, so a member never holds the same medal twice.
 */
export const awardFormSchema = z.object({
  memberId: z.string().uuid("Membro inválido"),
  medalId: z.string().uuid("Medalha inválida"),
  /** Internal note ("20 kills na Empire State"). Not shown on the vitrine. */
  note: z
    .string()
    .trim()
    .max(140, "A nota deve ter no máximo 140 caracteres")
    .optional()
    .transform((value) => (value ? value : null)),
});

/** Revoking needs only the same pair, so the client never sends a row id. */
export const awardKeySchema = awardFormSchema.pick({
  memberId: true,
  medalId: true,
});

export const inviteIdSchema = z.object({
  inviteId: z.string().uuid("Convite inválido"),
});

/** Shape every admin action returns, so forms can render errors uniformly. */
export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function actionError(
  error: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/**
 * Zod issues keyed by field name, the shape `ActionResult.fieldErrors` uses.
 * Lives here (and not in an action file) because a `"use server"` module may only
 * export async functions.
 */
export function fieldErrorsOf(error: {
  issues: { path: (string | number | symbol)[]; message: string }[];
}): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    map[key] = [...(map[key] ?? []), issue.message];
  }
  return map;
}
