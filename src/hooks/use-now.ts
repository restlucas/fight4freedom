"use client";

import { useSyncExternalStore } from "react";

/**
 * One shared wall clock for the whole page.
 *
 * Relative labels ("há 4 min") go stale the moment they are painted, and the
 * admin members table renders one per row. Giving each row its own
 * `setInterval` would mean ~100 timers all doing the same thing; a single
 * module-level ticker with `useSyncExternalStore` re-renders every subscriber
 * from one timer instead.
 *
 * Returns `null` until the component has mounted on the client. That is
 * deliberate: the value is `Date.now()`, which differs between the server
 * render and hydration, and a caller that renders it directly would produce a
 * hydration mismatch. Callers show a placeholder while it is null.
 */
const TICK_MS = 30_000;

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let now: number | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  if (timer === null) {
    // Stamped here, not at module load: the value must be fresh even when the
    // last subscriber left minutes ago and a new one just arrived.
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const notify of listeners) notify();
    }, TICK_MS);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
      now = null;
    }
  };
}

function getSnapshot(): number | null {
  return now;
}

function getServerSnapshot(): null {
  return null;
}

/** Current timestamp, refreshed every 30 s. Null before the first client tick. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
