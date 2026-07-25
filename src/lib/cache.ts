// Cache policy for the public vitrine, in one place.
//
// The showcase is read-only and identical for every visitor, so it belongs in a
// SERVER cache: one database read serves everyone until the entry is invalidated
// or expires. Pages stay dynamic (the build never needs a database connection);
// they just read from here instead of Supabase.
//
// Two rules that are easy to get wrong with `unstable_cache`:
//
//  1. It serializes with JSON.stringify/JSON.parse. A cached value must be
//     JSON-safe — a `Date` comes back as a string on a cache HIT but is still a
//     `Date` on a MISS, which breaks intermittently in production. That is why
//     the queries in src/features/clan/lib/queries.ts expose dates as ISO
//     strings instead of Date objects.
//  2. The cache key includes the arguments. Never pass a volatile value such as
//     `new Date()` — the cache would never hit and would grow without bound.
//     Time-scoped queries take a stable key (see monthKey in src/lib/month.ts).
//
// Invalidation:
//  - Fase 2: admin server actions call `revalidateVitrine(CACHE_TAG.medals)` (and
//    friends) after writing, so the vitrine updates immediately regardless of
//    the TTL. Use the helper, not revalidateTag directly — the cache-life
//    argument is easy to get backwards (see its doc comment).
//  - Fase 3: the scraper writes straight to the database and cannot call
//    revalidateTag, so the TTL below is what surfaces those writes.
//
// This module is also the single migration point to the `"use cache"` directive
// once it leaves experimental.

import { revalidateTag, unstable_cache } from "next/cache";

export const CACHE_TAG = {
  members: "members",
  medals: "medals",
  stats: "stats",
} as const;

export type CacheTag = (typeof CACHE_TAG)[keyof typeof CACHE_TAG];

/** Safety net for data written outside the app (the Fase 3 scraper). */
export const VITRINE_REVALIDATE_SECONDS = 300;

/**
 * Wraps a query in the shared cache policy.
 *
 * @param name  Stable cache key prefix. Arguments are appended automatically.
 * @param tags  Every domain the query reads, so a write to any of them
 *              invalidates this entry.
 */
export function cachedQuery<Args extends unknown[], Result>(
  name: string,
  tags: CacheTag[],
  query: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return unstable_cache(query, [name], {
    tags,
    revalidate: VITRINE_REVALIDATE_SECONDS,
  });
}

/**
 * Purges the given domains so the vitrine reflects a write immediately, instead
 * of waiting out the TTL. Call from Server Actions and Route Handlers only.
 *
 * `{ expire: 0 }` is deliberate and load-bearing. Next 16 takes a cache-life
 * profile as the second argument and applies it as
 * `expired = now + expire * 1000` (see the file-system cache handler), so a named
 * profile does NOT purge — it licenses the stale value to keep being served for
 * that long. "max" is the worst possible choice here: `expire` is a year.
 * Zero seconds is the same instant expiration the argument-less (deprecated)
 * form produces, without the deprecation warning.
 *
 * In a Server Action, `updateTag(tag)` is an alternative that also gives
 * read-your-own-writes within the same request; it throws in Route Handlers,
 * which is why this helper uses revalidateTag and works in both.
 */
export function revalidateVitrine(...tags: CacheTag[]): void {
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
}
