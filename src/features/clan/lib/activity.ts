// Pure merge for the activity feed's polling, kept out of the component so the
// interesting behaviour is unit tested rather than eyeballed in a browser.

import type { ActivityEvent } from "./queries";

/** How often the browser asks for new events. See /api/activity for why polling. */
export const ACTIVITY_POLL_MS = 30_000;

/** How long a new or changed row stays highlighted after it arrives. */
export const ACTIVITY_FLASH_MS = 6_000;

export type MergeResult = {
  events: ActivityEvent[];
  /** Ids that are new or changed, so the list can flash exactly those rows. */
  changed: string[];
};

/**
 * Folds a poll's payload into the list on screen.
 *
 * Merging BY ID rather than prepending, because a session event is mutable: the
 * member keeps playing and the same row comes back with more points. Prepending
 * would show them twice, once stale.
 *
 * Sorted by `updatedAt` after the fold, so an extended session climbs back to the
 * top the way it does on the server, and capped at the same limit the server uses
 * so an open page cannot grow without bound.
 */
export function mergeActivity(
  current: ActivityEvent[],
  incoming: ActivityEvent[],
  limit: number,
): MergeResult {
  if (incoming.length === 0) return { events: current, changed: [] };

  const byId = new Map(current.map((event) => [event.id, event]));
  const changed: string[] = [];

  for (const event of incoming) {
    const existing = byId.get(event.id);
    // An identical payload changes nothing and must not flash: the poll runs every
    // 30 s and the cadence upstream is 20 minutes, so most polls are no-ops.
    if (existing && existing.updatedAt === event.updatedAt) continue;
    byId.set(event.id, event);
    changed.push(event.id);
  }

  if (changed.length === 0) return { events: current, changed: [] };

  const events = [...byId.values()]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, limit);

  // A row that was pushed off the end by newer events is not "changed" any more,
  // so the flash never targets something that is no longer rendered.
  const visible = new Set(events.map((event) => event.id));
  return { events, changed: changed.filter((id) => visible.has(id)) };
}
