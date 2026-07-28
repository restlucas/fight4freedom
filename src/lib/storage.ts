// Browser storage access, in one place.
//
// Every key the app writes is namespaced under `@fight4freedom/`, so what belongs
// to this app is obvious in devtools and nothing collides with another app served
// from the same origin. Build keys with `storageKey()` — never hand-write the
// prefix at a call site.
//
// Reads and writes are wrapped in try/catch on purpose: localStorage throws when
// the user blocks storage (Safari private browsing, hardened profiles) and a
// remembered page size is never worth crashing a page over.

export const STORAGE_PREFIX = "@fight4freedom";

export function storageKey(name: string): string {
  return `${STORAGE_PREFIX}/${name}`;
}

/**
 * Stored JSON for `name`, or null when absent, unreadable or rejected by
 * `isValid`. The guard matters: the value comes from a previous version of the app
 * (or from a user editing devtools), so it is untrusted input.
 */
export function readStoredJson<T>(name: string, isValid: (value: unknown) => value is T): T | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(storageKey(name));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredJson(name: string, value: unknown): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey(name), JSON.stringify(value));
  } catch {
    // Storage blocked or full: the preference just does not persist.
  }

  // The `storage` event only fires in OTHER tabs, so this tab has to be told.
  notify(name);
}

// --- Store plumbing for useSyncExternalStore (see hooks/use-persisted-state.ts) ---
//
// Two requirements come from React: a snapshot that returns the SAME value while
// the underlying data has not changed (otherwise the render loops), and a server
// snapshot that never touches localStorage. Hence the cache keyed by raw string.

type CacheEntry = { raw: string | null; value: unknown };

const snapshots = new Map<string, CacheEntry>();
const listeners = new Map<string, Set<() => void>>();

function notify(name: string): void {
  snapshots.delete(name);
  for (const listener of listeners.get(name) ?? []) listener();
}

/** Subscribes to changes for `name`, in this tab and in others. */
export function subscribeStored(name: string, onChange: () => void): () => void {
  const set = listeners.get(name) ?? new Set();
  set.add(onChange);
  listeners.set(name, set);

  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === storageKey(name)) notify(name);
  };
  window.addEventListener("storage", onStorage);

  return () => {
    set.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Current value for `name`, stable between changes. Falls back whenever storage is
 * empty, unreadable or holds something `isValid` rejects.
 */
export function storedSnapshot<T>(
  name: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): T {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey(name));
  } catch {
    return fallback;
  }

  const cached = snapshots.get(name);
  if (cached && cached.raw === raw) return cached.value as T;

  let value = fallback;
  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isValid(parsed)) value = parsed;
    } catch {
      // Malformed: keep the fallback.
    }
  }

  snapshots.set(name, { raw, value });
  return value;
}
