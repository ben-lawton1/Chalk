// Single app-state store: setState, subscribe, selection/interaction helpers, toasts (WP0).
import type { AppState, ChalkElement, Interaction, Point, ToastState, Viewport } from '../types';
import { DEFAULT_STYLE, TOAST_MS } from '../constants';

export type Listener = (state: AppState, prev: AppState) => void;
export type StatePatch = Partial<AppState> | ((s: AppState) => Partial<AppState>);

export function initialState(): AppState {
  return {
    elements: [], selectedIds: [], viewport: { scrollX: 0, scrollY: 0, zoom: 1 }, viewportSize: { width: 0, height: 0 },
    tool: 'select', toolLocked: false, currentStyle: { ...DEFAULT_STYLE }, editing: null,
    interaction: { marquee: null, bindTarget: null, hoverId: null, cursor: null, gestureActive: false, dropPreview: null },
    board: null, saveStatus: 'loading', canUndo: false, canRedo: false, dialog: 'none', toast: null,
  };
}

let state: AppState = initialState();
const listeners = new Set<Listener>();
let lastPointerWorld: Point | null = null;   // NOT reactive: written on every pointermove without notifying
let toastSeq = 0;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function getState(): AppState { return state; }

/** No-op when every patched key is === to the current value. Listeners get (next, prev). */
export function setState(patch: StatePatch): void {
  const prev = state;
  const p = typeof patch === 'function' ? patch(prev) : patch;
  let changed = false;
  for (const k of Object.keys(p) as (keyof AppState)[]) {
    if (p[k] !== prev[k]) { changed = true; break; }
  }
  if (!changed) return;
  const next: AppState = { ...prev, ...p };
  state = next;
  for (const l of Array.from(listeners)) l(next, prev);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Tests only: replace the whole state (listeners are notified). */
export function resetState(overrides: Partial<AppState> = {}): void {
  const prev = state;
  state = { ...initialState(), ...overrides };
  lastPointerWorld = null;
  for (const l of Array.from(listeners)) l(state, prev);
}

export function setElements(elements: readonly ChalkElement[]): void { setState({ elements }); }

/** Dedupes; no-op if equal to the current selection (same ids, same order). */
export function setSelection(ids: readonly string[]): void {
  const unique = Array.from(new Set(ids));
  const cur = state.selectedIds;
  if (unique.length === cur.length && unique.every((id, i) => id === cur[i])) return;
  setState({ selectedIds: unique });
}

export function setViewport(viewport: Viewport): void {
  const v = state.viewport;
  if (v.scrollX === viewport.scrollX && v.scrollY === viewport.scrollY && v.zoom === viewport.zoom) return;
  setState({ viewport });
}

/** Shallow-merges into interaction; no-op when every patched field is === to the current one. */
export function setInteraction(patch: Partial<Interaction>): void {
  const cur = state.interaction;
  let changed = false;
  for (const k of Object.keys(patch) as (keyof Interaction)[]) {
    if (patch[k] !== cur[k]) { changed = true; break; }
  }
  if (!changed) return;
  setState({ interaction: { ...cur, ...patch } });
}

/** Selected elements in z-order. */
export function getSelectedElements(s: AppState = state): ChalkElement[] {
  const ids = new Set(s.selectedIds);
  return s.elements.filter((el) => ids.has(el.id));
}

export function notify(message: string, kind: ToastState['kind'] = 'info'): void {
  const id = ++toastSeq;
  setState({ toast: { id, message, kind } });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (state.toast?.id === id) setState({ toast: null }); }, TOAST_MS);
}

export function getLastPointerWorld(): Point | null { return lastPointerWorld; }
export function setLastPointerWorld(p: Point | null): void { lastPointerWorld = p; }
