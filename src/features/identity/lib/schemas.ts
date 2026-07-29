// Validation for the identity screen. On the server, because the client can be
// bypassed with a crafted POST.

import { z } from "zod";

/**
 * An account-name field as a member types it: trimmed, length-capped, and
 * NOTHING else. No lowercasing, no accent stripping, no clan-tag removal.
 *
 * That restraint is deliberate. EA's search is case-insensitive but matches the
 * WHOLE name, and the exact string the member typed is the evidence an admin
 * needs when the search finds nothing — `pFrançosa` and `pFrancosa` failing are
 * two different facts. Normalising here would destroy the only record of which
 * one was tried.
 */
const accountNameField = (label: string) =>
  z
    .string({ message: `Informe o ${label}` })
    .trim()
    .min(2, `Informe o ${label} com pelo menos 2 caracteres`)
    .max(80, "Use no máximo 80 caracteres");

/**
 * What the member declares. BOTH fields mandatory (clan owner's decision,
 * 2026-07-29).
 *
 * Worth knowing why a mandatory username is safe rather than merely harmless:
 * it is not a lookup key and it cannot make a findable account unfindable,
 * because `pickIdentity` applies it as a tiebreak only when it leaves at least
 * one candidate standing. A wrong username is ignored, not fatal.
 */
export const identityClaimSchema = z.object({
  eaName: accountNameField("nome da conta EA"),
  eaUsername: accountNameField("username da EA"),
});

export type IdentityClaimInput = z.input<typeof identityClaimSchema>;

/**
 * Confirming one candidate. The ids arrive from a hidden field, so they are
 * untrusted input and are shape-checked here before anything is written.
 *
 * Shape-checking is not authorization, and does not need to be: the action can
 * only ever write to the caller's OWN member row (`requireOwnMemberId`), so the
 * worst a forged id achieves is breaking the forger's own stats. The action still
 * re-reads the account from the source before binding it — see
 * confirmIdentityAction — which is what stops an account with no BF6 record from
 * being bound, forged or not.
 */
export const confirmIdentitySchema = identityClaimSchema.extend({
  personaId: z.string().trim().regex(/^\d+$/, "Conta inválida"),
  nucleusId: z.string().trim().regex(/^\d+$/, "Conta inválida"),
  /**
   * The username EA reports for the chosen account, carried through from the
   * search so `member.eaUsername` keeps meaning "what EA says" instead of "what
   * the member typed". Optional: EA omits it for some accounts, and a missing
   * label must not block a correct binding.
   */
  resolvedUsername: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((value) => (value ? value : null)),
});
