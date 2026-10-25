// Tests for the rough.js drawable generation and caches (WP2).
import { beforeEach, describe, expect, it } from 'vitest';
import type { ArrowElement, ShapeElement, TextElement } from '../types';
import { ARROWHEAD_ANGLE_DEG, DEFAULT_STYLE } from '../constants';
import { arrowheadPoints, clearDrawableCache, drawOrigin, getDrawables, shapeKey } from './roughShapes';

function shape(over: Partial<ShapeElement> = {}): ShapeElement {
  return {
    id: 'shape000001', seed: 1234, type: 'shape', shape: 'rectangle', x: 10, y: 20, width: 160, height: 100, label: '',
    style: { ...DEFAULT_STYLE }, ...over,
  };
}
function arrow(over: Partial<ArrowElement> = {}): ArrowElement {
  return {
    id: 'arrow0000001', seed: 77, type: 'arrow', start: { x: 5, y: 5 }, end: { x: 205, y: 55 },
    startBinding: null, endBinding: null, label: '', style: { ...DEFAULT_STYLE }, ...over,
  };
}
function text(): TextElement {
  return { id: 'text00000001', seed: 5, type: 'text', x: 0, y: 0, width: 50, height: 30, text: 'hi', autoResize: true, style: { ...DEFAULT_STYLE } };
}

beforeEach(() => {
  clearDrawableCache();
});

describe('drawOrigin', () => {
  it('is the top-left for shapes and text, the start point for arrows', () => {
    expect(drawOrigin(shape())).toEqual({ x: 10, y: 20 });
    expect(drawOrigin(text())).toEqual({ x: 0, y: 0 });
    expect(drawOrigin(arrow())).toEqual({ x: 5, y: 5 });
  });
});

describe('shapeKey', () => {
  it('ignores position and opacity, and text has an empty key', () => {
    const a = shape();
    const b = shape({ x: 999, y: -40, style: { ...a.style, opacity: 30 } });
    expect(shapeKey(a)).toBe(shapeKey(b));
    expect(shapeKey(text())).toBe('');
  });
  it('ignores the arrow position but not its vector', () => {
    const a = arrow();
    const moved = arrow({ start: { x: 105, y: 105 }, end: { x: 305, y: 155 } });
    const longer = arrow({ end: { x: 300, y: 55 } });
    expect(shapeKey(a)).toBe(shapeKey(moved));
    expect(shapeKey(a)).not.toBe(shapeKey(longer));
  });
  it('depends on size, style, seed and shape kind', () => {
    const a = shape();
    expect(shapeKey(a)).not.toBe(shapeKey(shape({ width: 161 })));
    expect(shapeKey(a)).not.toBe(shapeKey(shape({ seed: 99 })));
    expect(shapeKey(a)).not.toBe(shapeKey(shape({ shape: 'diamond' })));
    expect(shapeKey(a)).not.toBe(shapeKey(shape({ style: { ...a.style, roughness: 2 } })));
    expect(shapeKey(a)).not.toBe(shapeKey(shape({ style: { ...a.style, strokeColor: '#e03131' } })));
  });
  it('rounds sizes to 2 decimals', () => {
    expect(shapeKey(shape({ width: 160.001 }))).toBe(shapeKey(shape({ width: 160 })));
  });
});

describe('getDrawables caches', () => {
  it('returns the identical array for the same object', () => {
    const el = shape();
    expect(getDrawables(el)).toBe(getDrawables(el));
  });
  it('a translated copy hits the LRU and shares the drawables', () => {
    const el = shape();
    const copy = { ...el, x: el.x + 500, y: el.y - 20 };
    expect(getDrawables(copy)).toBe(getDrawables(el));
  });
  it('an arrow translated as a whole shares drawables', () => {
    const a = arrow();
    const moved = arrow({ start: { x: 50, y: 50 }, end: { x: 250, y: 100 } });
    expect(getDrawables(moved)).toBe(getDrawables(a));
  });
  it('a resized copy misses', () => {
    const el = shape();
    const bigger = { ...el, width: el.width + 10 };
    expect(getDrawables(bigger)).not.toBe(getDrawables(el));
  });
  it('a label or opacity change reuses the drawables', () => {
    const el = shape();
    const relabeled = { ...el, label: 'hello', style: { ...el.style, opacity: 50, fontSize: 32 } };
    expect(getDrawables(relabeled)).toBe(getDrawables(el));
  });
  it('clearDrawableCache forces regeneration', () => {
    const el = shape();
    const first = getDrawables(el);
    clearDrawableCache();
    expect(getDrawables(el)).not.toBe(first);
  });
  it('same seed is deterministic across cache clears; different seeds differ', () => {
    const el = shape();
    const a = JSON.stringify(getDrawables(el));
    clearDrawableCache();
    expect(JSON.stringify(getDrawables(shape()))).toBe(a);
    clearDrawableCache();
    expect(JSON.stringify(getDrawables(shape({ seed: 4321 })))).not.toBe(a);
  });
  it('text has no drawables', () => {
    expect(getDrawables(text())).toEqual([]);
  });
});

describe('getDrawables output', () => {
  it('generates one drawable per shape kind, including round rectangles via path', () => {
    for (const kind of ['rectangle', 'diamond', 'ellipse', 'triangle'] as const) {
      for (const edges of ['sharp', 'round'] as const) {
        const ds = getDrawables(shape({ shape: kind, style: { ...DEFAULT_STYLE, edges, backgroundColor: '#ffc9c9' } }));
        expect(ds).toHaveLength(1);
        expect(ds[0]!.sets.length).toBeGreaterThan(0);
      }
    }
  });
  it('adds an end arrowhead (default) and a start arrowhead on request', () => {
    expect(getDrawables(arrow())).toHaveLength(2);
    expect(getDrawables(arrow({ style: { ...DEFAULT_STYLE, startArrowhead: 'triangle', endArrowhead: 'arrow' } }))).toHaveLength(3);
    expect(getDrawables(arrow({ style: { ...DEFAULT_STYLE, startArrowhead: 'none', endArrowhead: 'none' } }))).toHaveLength(1);
  });
  it('a zero-length arrow draws only the body', () => {
    expect(getDrawables(arrow({ start: { x: 3, y: 3 }, end: { x: 3, y: 3 } }))).toHaveLength(1);
  });
});

describe('arrowheadPoints', () => {
  it('places two barbs symmetric about the shaft at the given size and angle', () => {
    const tip = { x: 100, y: 0 };
    const from = { x: 0, y: 0 };
    const [w1, w2] = arrowheadPoints(tip, from, 10, 30);
    const rad = (30 * Math.PI) / 180;
    // The shaft points back along -x; barbs sit at +/- 30 degrees from it.
    expect(w1.x).toBeCloseTo(100 - 10 * Math.cos(rad), 9);
    expect(Math.abs(w1.y)).toBeCloseTo(10 * Math.sin(rad), 9);
    expect(w2.x).toBeCloseTo(w1.x, 9);
    expect(w2.y).toBeCloseTo(-w1.y, 9);
    expect(Math.hypot(w1.x - tip.x, w1.y - tip.y)).toBeCloseTo(10, 9);
  });
  it('uses the default arrowhead angle symmetrically for a diagonal shaft', () => {
    const tip = { x: 50, y: 50 };
    const from = { x: 0, y: 0 };
    const [w1, w2] = arrowheadPoints(tip, from, 12, ARROWHEAD_ANGLE_DEG);
    const mid = { x: (w1.x + w2.x) / 2, y: (w1.y + w2.y) / 2 };
    // The barb midpoint lies on the shaft.
    expect(mid.x - tip.x).toBeCloseTo(mid.y - tip.y, 9);
    expect(mid.x).toBeLessThan(tip.x);
  });
  it('returns [tip, tip] for a degenerate shaft', () => {
    const tip = { x: 7, y: 9 };
    expect(arrowheadPoints(tip, tip, 10, 25)).toEqual([tip, tip]);
  });
});
