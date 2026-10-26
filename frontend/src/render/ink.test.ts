// Unit tests for the pure part of render/ink: the perfect-freehand outline, plus an import check for the package.
import { describe, expect, it } from 'vitest';
import { getStroke } from 'perfect-freehand';
import type { InkPoint } from '../types';
import { inkOutline } from './ink';

const line = (n: number, p = 0.5): InkPoint[] => Array.from({ length: n }, (_, i) => ({ x: i * 5, y: Math.sin(i / 3) * 4, p }));
const bbox = (pts: { x: number; y: number }[]) => ({
  minX: Math.min(...pts.map((q) => q.x)), maxX: Math.max(...pts.map((q) => q.x)),
  minY: Math.min(...pts.map((q) => q.y)), maxY: Math.max(...pts.map((q) => q.y)),
});

describe('perfect-freehand interop', () => {
  it('loads under node and returns an outline', () => {
    expect(getStroke([[0, 0], [10, 0], [20, 5]], { size: 4 }).length).toBeGreaterThan(3);
  });
});

describe('inkOutline', () => {
  it('returns a closed outline around the stroke, wider than the centre line', () => {
    const out = inkOutline(line(20), 6, false);
    expect(out.length).toBeGreaterThan(10);
    const b = bbox(out);
    expect(b.maxX - b.minX).toBeGreaterThan(95); // the centre line spans 95
    expect(b.maxY - b.minY).toBeGreaterThan(6);
  });
  it('a single point is a dot of roughly the pen size', () => {
    const out = inkOutline([{ x: 10, y: 10, p: 0.5 }], 8, false);
    expect(out.length).toBeGreaterThan(4);
    const b = bbox(out);
    expect(b.maxX - b.minX).toBeGreaterThan(4);
    expect(b.maxX - b.minX).toBeLessThan(10);
  });
  it('is empty for no points', () => {
    expect(inkOutline([], 4, true)).toEqual([]);
  });
  it('bigger pens give a fatter stroke', () => {
    const thin = bbox(inkOutline(line(20), 2, false));
    const fat = bbox(inkOutline(line(20), 12, false));
    expect(fat.maxY - fat.minY).toBeGreaterThan(thin.maxY - thin.minY);
  });
  it('real pressure thins light strokes, simulated pressure ignores p', () => {
    const light = bbox(inkOutline(line(20, 0.1), 10, true));
    const heavy = bbox(inkOutline(line(20, 1), 10, true));
    expect(heavy.maxY - heavy.minY).toBeGreaterThan(light.maxY - light.minY);
    const a = inkOutline(line(20, 0.1), 10, false);
    const b = inkOutline(line(20, 1), 10, false);
    expect(a).toEqual(b);
  });
});
