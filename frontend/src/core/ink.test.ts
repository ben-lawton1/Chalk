// Unit tests for core/ink: creation, bounds, distances and the resize mapping (v3).
import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../constants';
import { isValidSeed } from './ids';
import { createInk, distanceToInk, inkBounds, inkWorldPoints, normaliseInk, segmentDistanceToInk, transformInk } from './ink';

const style = { ...DEFAULT_STYLE, strokeWidth: 4 };
const line = () => createInk([{ x: 100, y: 50, p: 0.5 }, { x: 140, y: 50, p: 0.5 }, { x: 180, y: 50, p: 0.5 }], false, style);

describe('createInk', () => {
  it('normalises to the min corner with relative points and the extent', () => {
    const el = createInk([{ x: 30, y: 40, p: 0.5 }, { x: 10, y: 80, p: 1 }, { x: 50, y: 60, p: 0 }], true, style);
    expect([el.x, el.y, el.width, el.height]).toEqual([10, 40, 40, 40]);
    expect(el.points).toEqual([{ x: 20, y: 0, p: 0.5 }, { x: 0, y: 40, p: 1 }, { x: 40, y: 20, p: 0 }]);
    expect(el.type).toBe('ink');
    expect(el.pressure).toBe(true);
    expect(isValidSeed(el.seed)).toBe(true);
  });
  it('rounds coordinates to 2 decimals and pressure to 3', () => {
    const el = createInk([{ x: 1.23456, y: 2.34567, p: 0.123456 }, { x: 5.55555, y: 5.55555, p: 0.5 }], true, style);
    expect([el.x, el.y]).toEqual([1.23, 2.35]);
    expect(el.points[0]).toEqual({ x: 0, y: 0, p: 0.123 });
    expect(el.points[1]!.x).toBeCloseTo(4.33, 5);
  });
  it('copies the style and clamps p', () => {
    const el = createInk([{ x: 0, y: 0, p: 4 }, { x: 1, y: 1, p: -1 }], false, style);
    expect(el.style).toEqual(style);
    expect(el.style).not.toBe(style);
    expect(el.points.map((q) => q.p)).toEqual([1, 0]);
  });
  it('a single point has a zero extent', () => {
    const el = createInk([{ x: 7, y: 9, p: 0.5 }], false, style);
    expect([el.x, el.y, el.width, el.height]).toEqual([7, 9, 0, 0]);
  });
  it('normaliseInk is idempotent on its own output', () => {
    const el = createInk([{ x: 3.3, y: 4.4, p: 0.3 }, { x: 9, y: 1, p: 0.9 }], false, style);
    const again = normaliseInk(inkWorldPoints(el).map((q, i) => ({ ...q, p: el.points[i]!.p })));
    expect(again).toEqual({ x: el.x, y: el.y, width: el.width, height: el.height, points: el.points });
  });
});

describe('inkBounds / inkWorldPoints', () => {
  it('bounds are the bare points box and world points are absolute', () => {
    const el = line();
    expect(inkBounds(el)).toEqual({ x: 100, y: 50, width: 80, height: 0 });
    expect(inkWorldPoints(el)).toEqual([{ x: 100, y: 50 }, { x: 140, y: 50 }, { x: 180, y: 50 }]);
  });
});

describe('distanceToInk', () => {
  it('measures to the polyline', () => {
    const el = line();
    expect(distanceToInk(el, { x: 120, y: 60 })).toBeCloseTo(10);
    expect(distanceToInk(el, { x: 200, y: 50 })).toBeCloseTo(20);
    expect(distanceToInk(el, { x: 140, y: 50 })).toBe(0);
  });
  it('a single point is a distance to that point', () => {
    const el = createInk([{ x: 10, y: 10, p: 0.5 }], false, style);
    expect(distanceToInk(el, { x: 13, y: 14 })).toBeCloseTo(5);
  });
});

describe('segmentDistanceToInk', () => {
  it('is 0 when the segment crosses the stroke', () => {
    expect(segmentDistanceToInk(line(), { x: 140, y: 20 }, { x: 140, y: 90 })).toBe(0);
  });
  it('is the gap when the segment misses it', () => {
    expect(segmentDistanceToInk(line(), { x: 120, y: 70 }, { x: 160, y: 70 })).toBeCloseTo(20);
    expect(segmentDistanceToInk(line(), { x: 200, y: 40 }, { x: 200, y: 90 })).toBeCloseTo(20);
  });
  it('handles a single-point stroke', () => {
    const el = createInk([{ x: 10, y: 10, p: 0.5 }], false, style);
    expect(segmentDistanceToInk(el, { x: 0, y: 14 }, { x: 20, y: 14 })).toBeCloseTo(4);
  });
});

describe('transformInk', () => {
  it('maps absolute points, renormalises and scales the stroke width', () => {
    const el = line();
    const out = transformInk(el, (x) => 100 + (x - 100) * 2, (y) => y, 2);
    expect([out.x, out.y, out.width]).toEqual([100, 50, 160]);
    expect(out.style.strokeWidth).toBe(8);
    expect(out.id).toBe(el.id);
    expect(el.width).toBe(80); // the input is untouched
  });
  it('a flip keeps the stroke valid (min corner, positive extent)', () => {
    const out = transformInk(line(), (x) => 300 - x, (y) => y, 1);
    expect([out.x, out.width]).toEqual([120, 80]);
    expect(out.points[0]!.x).toBe(80);
  });
  it('never thins a stroke below 0.5', () => {
    expect(transformInk(line(), (x) => x, (y) => y, 0.01).style.strokeWidth).toBe(0.5);
  });
});
