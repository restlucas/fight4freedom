// Month boundaries for the ranking season. The clan is Brazilian, so a "month"
// runs on Brasília time (UTC-3, no DST since 2019) instead of UTC: the July
// ranking closes at midnight of August 1st in Brasília, not 21:00 of July 31st.

const BRASILIA_OFFSET_HOURS = -3;

/** Shifts an instant so the UTC getters read the Brasília wall clock. */
function toBrasiliaWallClock(instant: Date): Date {
  return new Date(instant.getTime() + BRASILIA_OFFSET_HOURS * 3_600_000);
}

/**
 * The UTC instant when the month containing `reference` ends (exclusive):
 * midnight of the 1st of the next month, Brasília time.
 */
export function monthEndsAt(reference: Date): Date {
  const local = toBrasiliaWallClock(reference);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1, -BRASILIA_OFFSET_HOURS),
  );
}

/**
 * Stable identifier for the ranking season, e.g. "2026-07" (Brasília calendar).
 *
 * Cached queries must be keyed by this instead of a Date: an instant changes
 * every millisecond, so it would never produce a cache hit (see src/lib/cache.ts).
 */
export function monthKey(reference: Date): string {
  const local = toBrasiliaWallClock(reference);
  const month = String(local.getUTCMonth() + 1).padStart(2, "0");
  return `${local.getUTCFullYear()}-${month}`;
}

/**
 * Whether a value is a well-formed season key ("2026-07").
 *
 * Season keys arrive from the URL (`?mes=`) and from query strings, and they end
 * up inside a cache key, so an unvalidated one would let a caller create cache
 * entries at will. Shape only — whether that season has a board is a database
 * question, answered by `getRankingMonths`.
 */
export function isMonthKey(value: string | null | undefined): value is string {
  if (!value) return false;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

/**
 * Turns a `monthKey` back into an instant safely inside that month, for the
 * snapshot maths in src/lib/stats/snapshots.ts. Midday on the 15th is far from
 * every timezone boundary, so the month never shifts.
 */
export function monthKeyToReference(key: string): Date {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 15, 12));
}

/** The UTC instant when the month containing `reference` started. */
export function monthStartsAt(reference: Date): Date {
  const local = toBrasiliaWallClock(reference);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, -BRASILIA_OFFSET_HOURS));
}
