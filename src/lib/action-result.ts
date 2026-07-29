// The shape every Server Action in the app returns, so any form renders errors
// the same way.
//
// Shared rather than owned by a feature because two features depend on it now:
// the admin panel, which defined it first, and the identity screen. CLAUDE.md
// forbids a feature importing from another feature, and this is exactly the
// "generic code stays shared" case that rule points at.

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
 *
 * Lives here and not next to the actions because a `"use server"` module may only
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
