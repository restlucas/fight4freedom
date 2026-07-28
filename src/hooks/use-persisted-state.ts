"use client";

import { useCallback, useSyncExternalStore } from "react";

import { storedSnapshot, subscribeStored, writeStoredJson } from "@/lib/storage";

/**
 * State backed by localStorage under the app's `@fight4freedom/` namespace.
 *
 * useSyncExternalStore rather than useState + an effect: localStorage is external
 * state, the server does not have it, and this is the hook that knows how to
 * hydrate from a server snapshot (the fallback) and then switch to the real value
 * without a setState-inside-an-effect cascade. It also picks up changes made in
 * another tab for free.
 *
 * @param name     Key without the prefix (see storageKey).
 * @param fallback Rendered on the server and until a valid stored value is found.
 * @param isValid  Guard for the stored value — it is untrusted input.
 */
export function usePersistedState<T>(
  name: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): [T, (next: T) => void] {
  const value = useSyncExternalStore(
    useCallback((onChange: () => void) => subscribeStored(name, onChange), [name]),
    useCallback(() => storedSnapshot(name, fallback, isValid), [name, fallback, isValid]),
    // Server render (and hydration): never reads localStorage.
    useCallback(() => fallback, [fallback]),
  );

  const update = useCallback(
    (next: T) => {
      writeStoredJson(name, next);
    },
    [name],
  );

  return [value, update];
}
