// Unit tests for state/store (WP0).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShapeElement } from '../types';
import { DEFAULT_STYLE, TOAST_MS } from '../constants';
import {
  getLastPointerWorld, getSelectedElements, getState, initialState, notify, resetState, setElements, setInteraction,
  setLastPointerWorld, setSelection, setState, setViewport, subscribe,
} from './store';

function shape(id: string): ShapeElement {
  return { id, seed: 1, style: { ...DEFAULT_STYLE }, type: 'shape', shape: 'rectangle', x: 0, y: 0, width: 10, height: 10, label: '' };
}

beforeEach(() => resetState());
afterEach(() => vi.useRealTimers());

describe('setState', () => {
  it('is a no-op when every patched key is equal', () => {
    const l = vi.fn();
    const off = subscribe(l);
    setState({ tool: 'select', toolLocked: false });
    expect(l).not.toHaveBeenCalled();
    off();
  });
  it('notifies with (next, prev) on change', () => {
    const calls: [string, string][] = [];
    const off = subscribe((next, prev) => calls.push([next.tool, prev.tool]));
    const before = getState();
    setState({ tool: 'hand' });
    expect(calls).toEqual([['hand', 'select']]);
    expect(getState().tool).toBe('hand');
    expect(getState()).not.toBe(before);
    off();
  });
  it('accepts a function patch', () => {
    setState((s) => ({ toolLocked: !s.toolLocked }));
    expect(getState().toolLocked).toBe(true);
  });
  it('unsubscribe stops notifications', () => {
    const l = vi.fn();
    const off = subscribe(l);
    off();
    setState({ tool: 'hand' });
    expect(l).not.toHaveBeenCalled();
  });
  it('delivers nested notifications immediately', () => {
    const seen: string[] = [];
    const off = subscribe((next) => {
      seen.push(next.tool);
      if (next.tool === 'hand') setState({ tool: 'arrow' });
    });
    setState({ tool: 'hand' });
    expect(seen).toEqual(['hand', 'arrow']);
    expect(getState().tool).toBe('arrow');
    off();
  });
});

describe('selection', () => {
  it('dedupes ids', () => {
    setSelection(['a', 'b', 'a']);
    expect(getState().selectedIds).toEqual(['a', 'b']);
  });
  it('is a no-op for an equal selection', () => {
    setSelection(['a', 'b']);
    const ref = getState().selectedIds;
    const l = vi.fn();
    const off = subscribe(l);
    setSelection(['a', 'b']);
    expect(l).not.toHaveBeenCalled();
    expect(getState().selectedIds).toBe(ref);
    setSelection(['b', 'a']);
    expect(l).toHaveBeenCalledTimes(1);
    off();
  });
  it('getSelectedElements returns z-ordered elements', () => {
    setElements([shape('a'), shape('b'), shape('c')]);
    setSelection(['c', 'a']);
    expect(getSelectedElements().map((e) => e.id)).toEqual(['a', 'c']);
  });
});

describe('setInteraction and setViewport', () => {
  it('setInteraction merges and ignores equal patches', () => {
    const l = vi.fn();
    const off = subscribe(l);
    setInteraction({ hoverId: 'x' });
    expect(getState().interaction.hoverId).toBe('x');
    expect(getState().interaction.gestureActive).toBe(false);
    setInteraction({ hoverId: 'x', cursor: null });
    expect(l).toHaveBeenCalledTimes(1);
    off();
  });
  it('setViewport ignores an equal viewport', () => {
    const l = vi.fn();
    const off = subscribe(l);
    setViewport({ scrollX: 0, scrollY: 0, zoom: 1 });
    expect(l).not.toHaveBeenCalled();
    setViewport({ scrollX: 5, scrollY: 0, zoom: 1 });
    expect(l).toHaveBeenCalledTimes(1);
    off();
  });
});

describe('notify', () => {
  it('sets a toast and clears it after TOAST_MS', () => {
    vi.useFakeTimers();
    notify('hello', 'error');
    expect(getState().toast).toMatchObject({ message: 'hello', kind: 'error' });
    vi.advanceTimersByTime(TOAST_MS - 1);
    expect(getState().toast).not.toBeNull();
    vi.advanceTimersByTime(2);
    expect(getState().toast).toBeNull();
  });
  it('a newer toast replaces the older one and its timer', () => {
    vi.useFakeTimers();
    notify('one');
    vi.advanceTimersByTime(TOAST_MS - 100);
    notify('two');
    const id = getState().toast!.id;
    vi.advanceTimersByTime(200);
    expect(getState().toast?.id).toBe(id);
    vi.advanceTimersByTime(TOAST_MS);
    expect(getState().toast).toBeNull();
  });
});

describe('resetState and the pointer position', () => {
  it('resetState restores the defaults and applies overrides', () => {
    setState({ tool: 'hand' });
    setLastPointerWorld({ x: 1, y: 2 });
    resetState({ toolLocked: true });
    expect(getState()).toEqual({ ...initialState(), toolLocked: true });
    expect(getLastPointerWorld()).toBeNull();
  });
  it('setLastPointerWorld does not notify', () => {
    const l = vi.fn();
    const off = subscribe(l);
    setLastPointerWorld({ x: 3, y: 4 });
    expect(l).not.toHaveBeenCalled();
    expect(getLastPointerWorld()).toEqual({ x: 3, y: 4 });
    off();
  });
});
