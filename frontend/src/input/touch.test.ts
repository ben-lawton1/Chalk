// Unit tests for the touch state machine (v3): injectable clock, PointerInfos passed in directly.
import { beforeEach, describe, expect, it } from 'vitest';
import type { ChalkElement, PointerInfo, ShapeElement } from '../types';
import { DEFAULT_STYLE, TOUCH_TAP_MAX_MS, TOUCH_TAP_SLOP_PX } from '../constants';
import { createInk } from '../core/ink';
import { getState, resetState, setElements, setSelection, setViewport } from '../state/store';
import { clearHistory, getHistorySizes } from '../state/history';
import { createTouchGestures } from './touch';

function at(x: number, y: number): PointerInfo {
  const v = getState().viewport;
  return {
    world: { x: x / v.zoom - v.scrollX, y: y / v.zoom - v.scrollY }, screen: { x, y }, shift: false, alt: false, mod: false,
    button: 0, buttons: 1, pointerType: 'touch', pressure: 0.5, samples: [],
  };
}
function box(id: string, x: number, y: number, w: number, h: number, filled = true): ShapeElement {
  return {
    id, seed: 3, type: 'shape', shape: 'rectangle', x, y, width: w, height: h, label: '',
    style: { ...DEFAULT_STYLE, backgroundColor: filled ? '#a5d8ff' : 'transparent' },
  };
}
const clock = { t: 10_000 };
let g = createTouchGestures(() => clock.t);

beforeEach(() => {
  resetState();
  clearHistory();
  clock.t = 10_000;
  g = createTouchGestures(() => clock.t);
});
function seed(...els: ChalkElement[]): void {
  setElements(els);
  clearHistory();
}
/** Down and up at one point, `ms` apart. */
function tap(x: number, y: number, id = 1, ms = 80): void {
  g.down(id, at(x, y));
  clock.t += ms;
  g.up(id, at(x, y));
}

describe('one finger: pan', () => {
  it('a drag past the slop pans the viewport from the start point, with any tool', () => {
    for (const tool of ['pen', 'rectangle', 'select'] as const) {
      resetState({ tool });
      g.down(1, at(100, 100));
      expect(g.mode()).toBe('pending');
      g.move(1, at(100 + TOUCH_TAP_SLOP_PX - 1, 100)); // still within the slop
      expect(g.mode()).toBe('pending');
      expect(getState().viewport.scrollX).toBe(0);
      g.move(1, at(50, 70)); // the finger moves left and up, so the page scrolls right and down (negative scroll)
      expect(g.mode()).toBe('pan');
      expect(getState().viewport.scrollX).toBe(-50);
      expect(getState().viewport.scrollY).toBe(-30);
      g.move(1, at(80, 100));
      expect(getState().viewport.scrollX).toBe(-20); // always measured from the start
      g.up(1, at(80, 100));
      expect(g.mode()).toBe('idle');
      expect(getState().elements).toHaveLength(0);
      setViewport({ scrollX: 0, scrollY: 0, zoom: 1 });
    }
  });
  it('pans in world units at other zoom levels', () => {
    setViewport({ scrollX: 0, scrollY: 0, zoom: 2 });
    g.down(1, at(100, 100));
    g.move(1, at(60, 100));
    expect(getState().viewport.scrollX).toBe(-20);
  });
  it('sets gestureActive while a finger is down and clears it at the end', () => {
    g.down(1, at(5, 5));
    expect(getState().interaction.gestureActive).toBe(true);
    g.up(1, at(5, 5));
    expect(getState().interaction.gestureActive).toBe(false);
  });
});

describe('two fingers: pinch', () => {
  it('spreading zooms in about the midpoint', () => {
    g.down(1, at(100, 200));
    g.down(2, at(300, 200));
    expect(g.mode()).toBe('pinch');
    g.move(2, at(500, 200)); // distance 200 -> 400, midpoint (300, 200) -> ... a=(100,200) b=(500,200)
    expect(getState().viewport.zoom).toBeCloseTo(2);
    g.move(1, at(0, 200)); // distance 500, midpoint 250
    expect(getState().viewport.zoom).toBeCloseTo(2.5);
  });
  it('a finger already panning does not make the view jump when the second finger lands', () => {
    g.down(1, at(100, 100));
    g.move(1, at(40, 100));
    const panned = getState().viewport;
    g.down(2, at(300, 100));
    expect(getState().viewport).toEqual(panned);
    g.move(2, at(300, 100)); // no movement: still the same
    expect(getState().viewport.zoom).toBeCloseTo(panned.zoom);
    expect(getState().viewport.scrollX).toBeCloseTo(panned.scrollX);
  });
  it('lifting one finger ends the pinch: the other finger does nothing until all are up', () => {
    g.down(1, at(100, 200));
    g.down(2, at(300, 200));
    g.move(2, at(400, 200));
    g.up(2, at(400, 200));
    expect(g.mode()).toBe('done');
    const v = getState().viewport;
    g.move(1, at(10, 10));
    expect(getState().viewport).toEqual(v);
    g.up(1, at(10, 10));
    expect(g.mode()).toBe('idle');
    expect(getState().selectedIds).toEqual([]);
  });
  it('a third finger is ignored', () => {
    g.down(1, at(100, 200));
    g.down(2, at(300, 200));
    g.down(3, at(200, 50));
    g.move(3, at(200, 300));
    expect(g.isTracking(3)).toBe(false);
    expect(g.mode()).toBe('pinch');
  });
});

describe('tap and double tap', () => {
  it('a tap selects the shape; a tap on empty canvas clears the selection', () => {
    seed(box('a', 100, 100, 100, 100), box('b', 400, 100, 50, 50));
    tap(150, 150);
    expect(getState().selectedIds).toEqual(['a']);
    clock.t += 1000;
    tap(420, 120);
    expect(getState().selectedIds).toEqual(['b']);
    clock.t += 1000;
    tap(700, 500);
    expect(getState().selectedIds).toEqual([]);
  });
  it('a tap uses the finger tolerance and also hits a hollow shape from the inside', () => {
    seed(box('hollow', 100, 100, 200, 200, false), box('near', 400, 100, 50, 50));
    tap(500 - 50 + 14, 125); // 14 px right of the box edge (x = 450): within TOUCH_HIT_TOLERANCE_PX
    expect(getState().selectedIds).toEqual(['near']);
    clock.t += 1000;
    tap(200, 200);
    expect(getState().selectedIds).toEqual(['hollow']);
  });
  it('a tap that lasts longer than TOUCH_TAP_MAX_MS selects nothing', () => {
    seed(box('a', 100, 100, 100, 100));
    tap(150, 150, 1, TOUCH_TAP_MAX_MS + 50);
    expect(getState().selectedIds).toEqual([]);
  });
  it('a double tap on a shape opens the editor on it (one undo step on commit is not needed)', () => {
    seed(box('a', 100, 100, 100, 100));
    tap(150, 150);
    clock.t += 120;
    tap(152, 151);
    expect(getState().editing?.id).toBe('a');
  });
  it('a double tap on empty canvas creates a text box in edit mode', () => {
    tap(300, 300);
    clock.t += 120;
    tap(300, 300);
    const s = getState();
    expect(s.elements).toHaveLength(1);
    expect(s.elements[0]!.type).toBe('text');
    expect(s.editing?.id).toBe(s.elements[0]!.id);
  });
  it('a double tap on ink only selects it', () => {
    const k = createInk([{ x: 100, y: 100, p: 0.5 }, { x: 200, y: 100, p: 0.5 }], false, DEFAULT_STYLE);
    seed(k);
    tap(150, 102);
    clock.t += 120;
    tap(150, 102);
    expect(getState().selectedIds).toEqual([k.id]);
    expect(getState().editing).toBeNull();
  });
  it('two slow taps are two single taps', () => {
    seed(box('a', 100, 100, 100, 100));
    tap(150, 150);
    clock.t += 2000;
    tap(150, 150);
    expect(getState().editing).toBeNull();
  });
  it('the text tool keeps working with touch: tap empty canvas to write, tap a shape to edit it', () => {
    resetState({ tool: 'text' });
    seed(box('a', 100, 100, 100, 100));
    tap(150, 150);
    expect(getState().editing?.id).toBe('a');
  });
  it('the text tool creates text on a single tap on empty canvas', () => {
    resetState({ tool: 'text' });
    tap(500, 400);
    expect(getState().elements).toHaveLength(1);
    expect(getState().editing).not.toBeNull();
  });
  it('a touch while editing only commits the editing', () => {
    seed(box('a', 100, 100, 100, 100));
    tap(150, 150);
    clock.t += 100;
    tap(150, 150);
    expect(getState().editing).not.toBeNull();
    clock.t += 2000;
    g.down(1, at(600, 400));
    expect(getState().editing).toBeNull();
    expect(g.mode()).toBe('done');
    g.up(1, at(600, 400));
    expect(g.mode()).toBe('idle');
  });
});

describe('touching the selection', () => {
  it('a drag on the selection moves it (one undo step) instead of panning', () => {
    seed(box('a', 100, 100, 100, 100));
    setSelection(['a']);
    g.down(1, at(150, 150));
    expect(g.mode()).toBe('select-drag');
    g.move(1, at(190, 170));
    g.up(1, at(190, 170));
    const a = getState().elements[0] as ShapeElement;
    expect([a.x, a.y]).toEqual([140, 120]);
    expect(getState().viewport.scrollX).toBe(0);
    expect(getHistorySizes().past).toBe(1);
  });
  it('a drag on a handle (generous finger size) resizes it', () => {
    seed(box('a', 100, 100, 100, 100));
    setSelection(['a']);
    g.down(1, at(214, 214));
    expect(g.mode()).toBe('select-drag');
    g.move(1, at(264, 264));
    g.up(1, at(264, 264));
    expect((getState().elements[0] as ShapeElement).width).toBeGreaterThan(100);
  });
  it('a second finger cancels the move and starts a pinch', () => {
    seed(box('a', 100, 100, 100, 100));
    setSelection(['a']);
    g.down(1, at(150, 150));
    g.move(1, at(200, 150));
    expect((getState().elements[0] as ShapeElement).x).toBe(150);
    g.down(2, at(400, 300));
    expect(g.mode()).toBe('pinch');
    expect((getState().elements[0] as ShapeElement).x).toBe(100); // the move was reverted
    expect(getHistorySizes().past).toBe(0);
  });
  it('a drag away from the selection pans', () => {
    seed(box('a', 100, 100, 100, 100));
    setSelection(['a']);
    g.down(1, at(600, 450));
    g.move(1, at(650, 450));
    expect(g.mode()).toBe('pan');
  });
});

describe('cancelling', () => {
  it('cancelAll(true) puts the viewport back (a palm that panned) and ends the gesture', () => {
    g.down(1, at(100, 100));
    g.move(1, at(0, 50));
    expect(getState().viewport.scrollX).toBe(-100);
    g.cancelAll(true);
    expect(getState().viewport).toEqual({ scrollX: 0, scrollY: 0, zoom: 1 });
    expect(g.mode()).toBe('idle');
    expect(getState().interaction.gestureActive).toBe(false);
    g.move(1, at(300, 300)); // the same finger keeps moving: ignored
    expect(getState().viewport.scrollX).toBe(0);
  });
  it('cancelAll(true) also reverts a pinch to the start of the whole gesture', () => {
    g.down(1, at(100, 100));
    g.move(1, at(40, 100));
    g.down(2, at(300, 100));
    g.move(2, at(500, 100));
    expect(getState().viewport.zoom).not.toBe(1);
    g.cancelAll(true);
    expect(getState().viewport).toEqual({ scrollX: 0, scrollY: 0, zoom: 1 });
  });
  it('cancelAll(false) keeps the viewport', () => {
    g.down(1, at(100, 100));
    g.move(1, at(30, 100));
    g.cancelAll(false);
    expect(getState().viewport.scrollX).toBe(-70);
  });
  it('cancel of a select-drag restores the elements', () => {
    seed(box('a', 100, 100, 100, 100));
    setSelection(['a']);
    g.down(1, at(150, 150));
    g.move(1, at(250, 150));
    g.cancel(1);
    expect((getState().elements[0] as ShapeElement).x).toBe(100);
    expect(g.mode()).toBe('idle');
  });
  it('pointercancel mid-pan keeps the view and ends the gesture', () => {
    g.down(1, at(100, 100));
    g.move(1, at(40, 100));
    g.cancel(1);
    expect(getState().viewport.scrollX).toBe(-60);
    expect(g.mode()).toBe('idle');
  });
});
