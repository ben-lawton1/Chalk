// Unit tests for state/history (WP0).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShapeElement } from '../types';
import { DEFAULT_STYLE, HISTORY_LIMIT, HISTORY_MERGE_MS } from '../constants';
import { getState, resetState, setElements, setSelection } from './store';
import { clearHistory, getHistorySizes, historyRedo, historyUndo, pushUndo, takeSnapshot } from './history';

function shape(id: string, x = 0): ShapeElement {
  return { id, seed: 1, style: { ...DEFAULT_STYLE }, type: 'shape', shape: 'rectangle', x, y: 0, width: 10, height: 10, label: '' };
}

/** Applies an edit the way a tool does: snapshot, mutate state, push. */
function edit(elements: ShapeElement[], mergeKey?: string): void {
  const before = takeSnapshot();
  setElements(elements);
  pushUndo(before, mergeKey);
}

beforeEach(() => {
  resetState();
  clearHistory();
});
afterEach(() => vi.useRealTimers());

describe('push, undo, redo', () => {
  it('undoes and redoes whole element arrays', () => {
    const a = shape('a');
    const b = shape('b');
    edit([a]);
    edit([a, b]);
    expect(getState().canUndo).toBe(true);
    expect(getState().canRedo).toBe(false);
    expect(historyUndo()).toBe(true);
    expect(getState().elements).toEqual([a]);
    expect(getState().canRedo).toBe(true);
    expect(historyUndo()).toBe(true);
    expect(getState().elements).toEqual([]);
    expect(getState().canUndo).toBe(false);
    expect(historyUndo()).toBe(false);
    expect(historyRedo()).toBe(true);
    expect(getState().elements).toEqual([a]);
    expect(historyRedo()).toBe(true);
    expect(getState().elements).toEqual([a, b]);
    expect(historyRedo()).toBe(false);
    expect(getState().canRedo).toBe(false);
  });
  it('a new push clears the redo stack', () => {
    edit([shape('a')]);
    historyUndo();
    expect(getHistorySizes().future).toBe(1);
    edit([shape('b')]);
    expect(getHistorySizes().future).toBe(0);
    expect(getState().canRedo).toBe(false);
  });
  it('ignores a push whose elements did not change', () => {
    const a = shape('a');
    setElements([a]);
    pushUndo({ elements: getState().elements, selectedIds: [] });
    expect(getHistorySizes().past).toBe(0);
    pushUndo({ elements: [a], selectedIds: [] });
    expect(getHistorySizes().past).toBe(0);
    expect(getState().canUndo).toBe(false);
  });
  it('filters the restored selection to ids that exist', () => {
    const a = shape('a');
    const b = shape('b');
    setElements([a, b]);
    setSelection(['a', 'b']);
    const before = takeSnapshot();
    setElements([a]);
    setSelection(['a']);
    pushUndo(before);
    historyUndo();
    expect(getState().selectedIds).toEqual(['a', 'b']);
    historyRedo();
    expect(getState().selectedIds).toEqual(['a']);
    // undo to a snapshot whose selection names an element that no longer exists
    clearHistory();
    resetState({ elements: [a], selectedIds: ['a', 'ghost'] });
    const snap = takeSnapshot();
    setElements([a, b]);
    pushUndo(snap);
    historyUndo();
    expect(getState().selectedIds).toEqual(['a']);
  });
});

describe('limits and merging', () => {
  it(`keeps at most ${HISTORY_LIMIT} entries`, () => {
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) edit([shape('a', i + 1)]);
    expect(getHistorySizes().past).toBe(HISTORY_LIMIT);
  });
  it('merges pushes with the same key inside the window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    edit([shape('a', 1)], 'nudge');
    vi.advanceTimersByTime(HISTORY_MERGE_MS / 2);
    edit([shape('a', 2)], 'nudge');
    vi.advanceTimersByTime(HISTORY_MERGE_MS / 2);
    edit([shape('a', 3)], 'nudge');
    expect(getHistorySizes().past).toBe(1);
    historyUndo();
    expect(getState().elements).toEqual([]);
  });
  it('does not merge after the window, with another key, or without a key', () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
    edit([shape('a', 1)], 'nudge');
    vi.advanceTimersByTime(HISTORY_MERGE_MS + 1);
    edit([shape('a', 2)], 'nudge');
    expect(getHistorySizes().past).toBe(2);
    edit([shape('a', 3)], 'opacity');
    expect(getHistorySizes().past).toBe(3);
    edit([shape('a', 4)]);
    edit([shape('a', 5)]);
    expect(getHistorySizes().past).toBe(5);
  });
});

describe('clearHistory', () => {
  it('empties both stacks and the flags', () => {
    edit([shape('a')]);
    historyUndo();
    clearHistory();
    expect(getHistorySizes()).toEqual({ past: 0, future: 0 });
    expect(getState().canUndo).toBe(false);
    expect(getState().canRedo).toBe(false);
  });
});
