// Snapshot undo/redo stack with mergeKey coalescing (WP0). UI code must call actions.undo()/redo(), not these.
import type { ChalkElement, Snapshot } from '../types';
import { HISTORY_LIMIT, HISTORY_MERGE_MS } from '../constants';
import { getState, setState } from './store';

interface Entry { snap: Snapshot; key: string | undefined; at: number }
const past: Entry[] = [];
let future: Snapshot[] = [];

function sameElements(a: readonly ChalkElement[], b: readonly ChalkElement[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function filterSelection(elements: readonly ChalkElement[], ids: readonly string[]): string[] {
  const existing = new Set(elements.map((e) => e.id));
  return ids.filter((id) => existing.has(id));
}
function sync(): void { setState({ canUndo: past.length > 0, canRedo: future.length > 0 }); }

export function takeSnapshot(): Snapshot {
  const s = getState();
  return { elements: s.elements, selectedIds: s.selectedIds };
}
/** Records `before` as one undo step. Selection-only / no-op changes are ignored. */
export function pushUndo(before: Snapshot, mergeKey?: string): void {
  if (sameElements(before.elements, getState().elements)) return;
  const now = Date.now();
  const top = past[past.length - 1];
  if (mergeKey !== undefined && top !== undefined && top.key === mergeKey && now - top.at < HISTORY_MERGE_MS) {
    top.at = now;
  } else {
    past.push({ snap: before, key: mergeKey, at: now });
    if (past.length > HISTORY_LIMIT) past.shift();
  }
  future = [];
  sync();
}
/** Low-level; UI and keyboard MUST call actions.undo() instead (it guards editing/gestures). */
export function historyUndo(): boolean {
  const entry = past.pop();
  if (!entry) return false;
  future.push(takeSnapshot());
  setState({ elements: entry.snap.elements, selectedIds: filterSelection(entry.snap.elements, entry.snap.selectedIds) });
  sync();
  return true;
}
/** Low-level; UI and keyboard MUST call actions.redo(). */
export function historyRedo(): boolean {
  const snap = future.pop();
  if (!snap) return false;
  past.push({ snap: takeSnapshot(), key: undefined, at: 0 });
  setState({ elements: snap.elements, selectedIds: filterSelection(snap.elements, snap.selectedIds) });
  sync();
  return true;
}
export function clearHistory(): void { past.length = 0; future = []; sync(); }
export function getHistorySizes(): { past: number; future: number } { return { past: past.length, future: future.length }; }
