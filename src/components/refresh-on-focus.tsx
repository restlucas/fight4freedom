"use client";

// Re-runs the server render when the visitor comes back to the tab.
//
// WHAT IT FIXES. The vitrine pages are `force-dynamic`, so every request gets
// fresh data — but a page already on screen never changes, because the RSC payload
// was delivered once and there is no channel back. Someone who left /ranking open
// during a collection cycle is reading a board from twenty minutes ago, and the
// only tell is the countdown ticking beside frozen numbers.
//
// `router.refresh()` and not a fetch of our own: it re-runs the page on the
// server, which recomputes the cached queries the collector purged, and swaps the
// result in without losing scroll position or client state. Nothing here knows what
// a ranking is, so the same component serves any page.
//
// NOT A POLL. It fires on return to the tab, so an idle tab costs nothing. Live
// updates while someone is actually watching are a different feature, and the honest
// tool for it is a push channel (docs/plano.md > Backlog técnico).

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Floor between refreshes. Alt-tabbing between two windows fires `focus` and
 * `visibilitychange` constantly, and refetching the page on each switch would be a
 * poll with extra steps. 30 s matches `staleTimes.dynamic` in next.config.ts, so
 * this never refetches something the router would still consider fresh.
 */
const MIN_INTERVAL_MS = 30_000;

interface RefreshOnFocusProps {
  /** Override for tests. */
  minIntervalMs?: number;
}

export function RefreshOnFocus({ minIntervalMs = MIN_INTERVAL_MS }: RefreshOnFocusProps) {
  const router = useRouter();
  const lastRefresh = useRef(0);

  useEffect(() => {
    // Stamped on mount rather than in the ref's initial value: `Date.now()` during
    // render is an impure call (React's rules of components, and the lint rule
    // enforces it). The effect runs right after mount, so the meaning is the same —
    // the page was just rendered on the server, so a return to the tab inside the
    // window has nothing to fetch.
    lastRefresh.current = Date.now();

    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefresh.current < minIntervalMs) return;
      lastRefresh.current = now;
      router.refresh();
    };

    // Both events, because they answer different questions. `visibilitychange`
    // covers switching tabs; `focus` covers switching WINDOWS, where the tab stays
    // "visible" and visibilitychange never fires.
    document.addEventListener("visibilitychange", maybeRefresh);
    window.addEventListener("focus", maybeRefresh);
    return () => {
      document.removeEventListener("visibilitychange", maybeRefresh);
      window.removeEventListener("focus", maybeRefresh);
    };
  }, [router, minIntervalMs]);

  return null;
}
