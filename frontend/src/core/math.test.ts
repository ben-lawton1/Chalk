// Unit tests for core/math (WP0).
import { describe, expect, it } from 'vitest';
import {
  add, clamp, dist, distToSegment, expandRect, len, nearlyEqual, normalize, pointsNear, rectCenter,
  rectContainsPoint, rectContainsRect, rectFromPoints, rectsIntersect, rotate, safeDiv, sgn, snapAngle, sub, unionRects,
} from './math';

describe('vector helpers', () => {
  it('adds, subtracts, measures and normalizes', () => {
    expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    expect(sub({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: -2, y: -2 });
    expect(len({ x: 3, y: 4 })).toBe(5);
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(len(normalize({ x: 10, y: -4 }))).toBeCloseTo(1, 12);
  });
  it('rotates counter-clockwise in math orientation', () => {
    const r = rotate({ x: 1, y: 0 }, 90);
    expect(r.x).toBeCloseTo(0, 12);
    expect(r.y).toBeCloseTo(1, 12);
  });
  it('clamp, sgn and nearlyEqual', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(sgn(0)).toBe(1);
    expect(sgn(-0.1)).toBe(-1);
    expect(nearlyEqual(1, 1 + 1e-7)).toBe(true);
    expect(nearlyEqual(1, 1.001)).toBe(false);
    expect(pointsNear({ x: 0, y: 0 }, { x: 0.0005, y: 0 })).toBe(true);
    expect(pointsNear({ x: 0, y: 0 }, { x: 0.01, y: 0 })).toBe(false);
  });
});

describe('safeDiv', () => {
  it('uses the fallback for tiny denominators', () => {
    expect(safeDiv(4, 2)).toBe(2);
    expect(safeDiv(4, 0)).toBe(1);
    expect(safeDiv(4, 1e-12, 7)).toBe(7);
  });
});

describe('distToSegment', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };
  it('measures to the interior', () => {
    expect(distToSegment({ x: 5, y: 3 }, a, b)).toBe(3);
  });
  it('measures to the endpoints beyond the segment', () => {
    expect(distToSegment({ x: -3, y: 4 }, a, b)).toBe(5);
    expect(distToSegment({ x: 13, y: 4 }, a, b)).toBe(5);
  });
  it('handles a degenerate segment', () => {
    expect(distToSegment({ x: 3, y: 4 }, a, a)).toBe(5);
  });
});

describe('rect helpers', () => {
  it('rectFromPoints normalizes', () => {
    expect(rectFromPoints({ x: 10, y: 8 }, { x: 2, y: 3 })).toEqual({ x: 2, y: 3, width: 8, height: 5 });
  });
  it('unionRects covers both', () => {
    expect(unionRects({ x: 0, y: 0, width: 4, height: 4 }, { x: 10, y: -2, width: 2, height: 2 })).toEqual({ x: 0, y: -2, width: 12, height: 6 });
  });
  it('expandRect grows, shrinks and floors at zero', () => {
    expect(expandRect({ x: 0, y: 0, width: 10, height: 10 }, 2)).toEqual({ x: -2, y: -2, width: 14, height: 14 });
    expect(expandRect({ x: 0, y: 0, width: 10, height: 10 }, -20)).toEqual({ x: 5, y: 5, width: 0, height: 0 });
  });
  it('contains and intersects inclusively', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectContainsPoint(r, { x: 10, y: 10 })).toBe(true);
    expect(rectContainsPoint(r, { x: 10.1, y: 5 })).toBe(false);
    expect(rectContainsRect(r, { x: 0, y: 0, width: 10, height: 10 })).toBe(true);
    expect(rectContainsRect(r, { x: 1, y: 1, width: 10, height: 5 })).toBe(false);
    expect(rectsIntersect(r, { x: 10, y: 10, width: 5, height: 5 })).toBe(true);
    expect(rectsIntersect(r, { x: 11, y: 0, width: 5, height: 5 })).toBe(false);
    expect(rectCenter(r)).toEqual({ x: 5, y: 5 });
  });
});

describe('snapAngle', () => {
  it('snaps to 15 degree steps and keeps the length', () => {
    const origin = { x: 100, y: 100 };
    const p = { x: 100 + 100 * Math.cos((17 * Math.PI) / 180), y: 100 + 100 * Math.sin((17 * Math.PI) / 180) };
    const s = snapAngle(origin, p, 15);
    expect(dist(origin, s)).toBeCloseTo(100, 9);
    expect(Math.atan2(s.y - origin.y, s.x - origin.x)).toBeCloseTo((15 * Math.PI) / 180, 9);
  });
  it('returns the point itself at the origin', () => {
    expect(snapAngle({ x: 1, y: 1 }, { x: 1, y: 1 }, 15)).toEqual({ x: 1, y: 1 });
  });
});
