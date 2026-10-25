// Unit tests for the SHAPES registry (WP0).
import { describe, expect, it } from 'vitest';
import type { Rect } from '../types';
import { DEFAULT_STYLE } from '../constants';
import { SHAPES, SHAPE_KINDS, cornerRadius, insetRect, isShapeKind, roundedRectPath } from './shapes';

const R: Rect = { x: 10, y: 20, width: 200, height: 120 };
const EPS = 1e-9;

function inside(outer: Rect, p: { x: number; y: number }): boolean {
  return p.x >= outer.x - EPS && p.x <= outer.x + outer.width + EPS && p.y >= outer.y - EPS && p.y <= outer.y + outer.height + EPS;
}

describe('SHAPES registry', () => {
  it('has an entry for every kind, in toolbar order', () => {
    expect(SHAPE_KINDS).toEqual(['rectangle', 'diamond', 'ellipse', 'triangle']);
    for (const k of SHAPE_KINDS) {
      expect(SHAPES[k].kind).toBe(k);
      expect(SHAPES[k].shortcuts.length).toBeGreaterThan(0);
      expect(SHAPES[k].icon.length).toBeGreaterThan(0);
    }
  });
  it.each(SHAPE_KINDS)('%s: outline stays inside its rect', (k) => {
    const o = SHAPES[k].outline(R);
    if (o.kind === 'polygon') {
      expect(o.points.length).toBeGreaterThanOrEqual(3);
      for (const p of o.points) expect(inside(R, p)).toBe(true);
    } else {
      expect(o.cx - o.rx).toBeGreaterThanOrEqual(R.x - EPS);
      expect(o.cx + o.rx).toBeLessThanOrEqual(R.x + R.width + EPS);
      expect(o.cy - o.ry).toBeGreaterThanOrEqual(R.y - EPS);
      expect(o.cy + o.ry).toBeLessThanOrEqual(R.y + R.height + EPS);
    }
  });
  it.each(SHAPE_KINDS)('%s: labelBox stays inside its rect', (k) => {
    const b = SHAPES[k].labelBox(R);
    expect(b.width).toBeGreaterThan(0);
    expect(b.height).toBeGreaterThan(0);
    expect(inside(R, { x: b.x, y: b.y })).toBe(true);
    expect(inside(R, { x: b.x + b.width, y: b.y + b.height })).toBe(true);
  });
  it.each(SHAPE_KINDS)('%s: labelBox height is linear in the rect height', (k) => {
    const h = (height: number) => SHAPES[k].labelBox({ ...R, height }).height;
    const slope1 = (h(300) - h(200)) / 100;
    const slope2 = (h(500) - h(300)) / 200;
    expect(slope1).toBeGreaterThan(0);
    expect(Math.abs(slope1 - slope2)).toBeLessThan(1e-9);
  });
  it('only the rectangle has a path, and only with round edges', () => {
    expect(SHAPES.rectangle.path?.(R, { ...DEFAULT_STYLE, edges: 'round' })).toMatch(/^M /);
    expect(SHAPES.rectangle.path?.(R, { ...DEFAULT_STYLE, edges: 'sharp' })).toBeNull();
    expect(SHAPES.diamond.path).toBeUndefined();
  });
});

describe('helpers', () => {
  it('isShapeKind', () => {
    expect(isShapeKind('ellipse')).toBe(true);
    expect(isShapeKind('hexagon')).toBe(false);
    expect(isShapeKind(3)).toBe(false);
  });
  it('insetRect keeps the center and floors the size at 1', () => {
    expect(insetRect({ x: 0, y: 0, width: 100, height: 50 }, 10)).toEqual({ x: 10, y: 10, width: 80, height: 30 });
    expect(insetRect({ x: 0, y: 0, width: 10, height: 10 }, 20)).toEqual({ x: 4.5, y: 4.5, width: 1, height: 1 });
  });
  it('cornerRadius is capped', () => {
    expect(cornerRadius({ x: 0, y: 0, width: 40, height: 100 })).toBe(10);
    expect(cornerRadius({ x: 0, y: 0, width: 1000, height: 1000 })).toBe(32);
  });
  it('roundedRectPath is a closed path', () => {
    const d = roundedRectPath({ x: 0, y: 0, width: 100, height: 50 }, 10);
    expect(d.startsWith('M 10 0')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });
});
