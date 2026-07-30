// Shared helpers for turning a typed EA name into the identity columns on `member`.
//
// A PLAIN MODULE, and that is the whole reason it exists. These three started inside
// `./actions.ts`, which carries `"use server"`, and such a module may only export async
// functions — so two of the three could not be exported at all. When the candidature
// queue needed the same three (`./recruit-actions.ts` creates a member from an approved
// application), the choice was duplicating them or moving them here.
//
// Same reasoning that moved `fieldErrorsOf` to `@/lib/action-result`. Two copies of
// "how a member gets its EA identity" would drift, and the direction they would drift in
// is the one that costs the most: a member created through one path bound correctly and
// through the other not at all.

import { gametoolsProvider } from "@/lib/stats/gametools";
import type { ResolvedIdentity } from "@/lib/stats/provider";

/**
 * Best-effort resolution of the EA identity from the EA display name (NOT the clan
 * nickname, which is cosmetic and may differ).
 *
 * Registration must never fail because a third-party API is down, so any error becomes
 * null and the scheduled collector self-heals it on the next runs
 * (src/lib/stats/collect.ts). A name matching several distinct accounts also resolves to
 * null — see pickIdentity in src/lib/stats/gametools.ts.
 */
export async function resolveEaIdentity(
  name: string | null,
  username: string | null,
): Promise<ResolvedIdentity | null> {
  if (!name) return null;
  try {
    return await gametoolsProvider.searchPlayer(name, username);
  } catch {
    return null;
  }
}

/**
 * The identity columns to write, or nothing when the lookup did not resolve.
 *
 * `eaUsername` is only filled in when the form left it blank: it is an admin-editable
 * field now, and a resolution must not silently overwrite a value somebody typed to tell
 * two same-named accounts apart.
 */
export function identityData(identity: ResolvedIdentity | null, typedUsername: string | null) {
  if (!identity) return {};
  return {
    eaPersonaId: identity.personaId,
    eaNucleusId: identity.nucleusId,
    ...(typedUsername ? {} : { eaUsername: identity.username }),
  };
}

/**
 * The form no longer has its own "Id na plataforma" input (removed on request,
 * 2026-07-28): the nick doubles as the public platform handle.
 *
 * Kept as a written column rather than dropped because it is still rendered on the
 * vitrine and in the admin table. Note the consequence, flagged for review:
 * `eaLookupName` falls back to `platformId`, so a member saved with no EA name would be
 * searched on EA BY THEIR CLAN NICKNAME.
 */
export function platformIdFrom(nickname: string): string {
  return nickname;
}
