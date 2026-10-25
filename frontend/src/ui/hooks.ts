// React hooks over the store: cached selector hook and shallowEqual (WP0).
import { useRef, useSyncExternalStore } from 'react';
import type { AppState } from '../types';
import { getState, subscribe } from '../state/store';

/** Selector hook. Cached per (state, selector) so derived arrays/objects never cause render loops. */
export function useAppState<T>(selector: (s: AppState) => T, equal: (a: T, b: T) => boolean = Object.is): T {
  const cache = useRef<{ s: AppState; sel: (s: AppState) => T; v: T } | null>(null);
  const get = (): T => {
    const s = getState();
    const c = cache.current;
    if (c && c.s === s && c.sel === selector) return c.v;
    const v = selector(s);
    if (c && equal(c.v, v)) { cache.current = { s, sel: selector, v: c.v }; return c.v; }
    cache.current = { s, sel: selector, v };
    return v;
  };
  return useSyncExternalStore(subscribe, get, get);
}

/** Arrays: same length and items ===. Objects: same keys and values ===. */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => Object.is(x, b[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
