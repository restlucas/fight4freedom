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
//  - Fase 2: admin server actions call `revalidateTag(CACHE_TAG.medals)` (and
//    friends) after writing, so the vitrine updates immediately regardless of
//    the TTL.
//  - Fase 3: the scraper writes straight to the database and cannot call
//    revalidateTag, so the TTL below is what surfaces those writes.
//
// This module is also the single migration point to the `"use cache"` directive
// once it leaves experimental.

import { unstable_cache } from "next/cache";

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
