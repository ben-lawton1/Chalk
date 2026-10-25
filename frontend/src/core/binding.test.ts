// Unit tests for core/binding: targets, anchors, orbit placement, re-routing (WP1).
import { describe, expect, it } from 'vitest';
import type { ArrowElement, BindableElement, Binding, ChalkElement, Point, ShapeElement, ShapeKind, Style, TextElement } from '../types';
import { BIND_GAP, DEFAULT_STYLE } from '../constants';
import { distanceToOutline, getOutline, rayExit } from './geometry';
import {
  arrowsBoundTo, chooseFixedPoint, findBindTarget, focusPoint, indexById, resolveArrow, unbindFrom, updateBoundArrows,
} from './binding';

let seq = 0;
function mkShape(kind: ShapeKind, x: number, y: number, width: number, height: number, over: Partial<ShapeElement> = {}, style: Partial<Style> = {}): ShapeElement {
  return { id: over.id ?? `s${++seq}`, seed: 1, type: 'shape', shape: kind, x, y, width, height, label: '', style: { ...DEFAULT_STYLE, ...style }, ...over };
}
function mkText(x: number, y: number, width: number, height: number, over: Partial<TextElement> = {}): TextElement {
  return { id: over.id ?? `t${++seq}`, seed: 1, type: 'text', x, y, width, height, text: 'txt', autoResize: true, style: { ...DEFAULT_STYLE }, ...over };
}
function bind(el: BindableElement, fixedPoint: [number, number] = [0.5, 0.5]): Binding {
  return { elementId: el.id, fixedPoint };
}
function mkArrow(start: Point, end: Point, sb: Binding | null, eb: Binding | null, over: Partial<ArrowElement> = {}): ArrowElement {
  return { id: over.id ?? `a${++seq}`, seed: 1, type: 'arrow', start, end, startBinding: sb, endBinding: eb, label: '', style: { ...DEFAULT_STYLE }, ...over };
}
function near(p: Point, x: number, y: number, eps = 0.5): void {
  expect(Math.abs(p.x - x)).toBeLessThanOrEqual(eps);
  expect(Math.abs(p.y - y)).toBeLessThanOrEqual(eps);
}
function route(elements: ChalkElement[]): ArrowElement {
  const out = updateBoundArrows(elements, null);
  return out.find((e) => e.type === 'arrow') as ArrowElement;
}

describe('indexById / arrowsBoundTo', () => {
  it('indexes by id and finds bound arrows', () => {
    const a = mkShape('rectangle', 0, 0, 10, 10);
    const b = mkShape('rectangle', 100, 0, 10, 10);
    const c = mkShape('rectangle', 200, 0, 10, 10);
    const ar1 = mkArrow({ x: 0, y: 0 }, { x: 1, y: 1 }, bind(a), bind(b));
    const ar2 = mkArrow({ x: 0, y: 0 }, { x: 1, y: 1 }, null, bind(c));
    const els = [a, b, c, ar1, ar2];
    const m = indexById(els);
    expect(m.get(b.id)).toBe(b);
    expect(m.size).toBe(5);
    expect(arrowsBoundTo(els, a.id)).toEqual([ar1]);
    expect(arrowsBoundTo(els, c.id)).toEqual([ar2]);
    expect(arrowsBoundTo(els, 'nope')).toEqual([]);
  });
});

describe('findBindTarget', () => {
  const box = mkShape('rectangle', 0, 0, 100, 100);

  it('matches inside the outline and within BIND_DISTANCE_PX / zoom of it', () => {
    expect(findBindTarget([box], { x: 50, y: 50 }, 1)).toBe(box);
    expect(findBindTarget([box], { x: 115, y: 50 }, 1)).toBe(box);
    expect(findBindTarget([box], { x: 117, y: 50 }, 1)).toBeNull();
    expect(findBindTarget([box], { x: 109, y: 50 }, 2)).toBeNull(); // limit is 8 world px at zoom 2
    expect(findBindTarget([box], { x: 107, y: 50 }, 0.5)).toBe(box); // 32 world px at zoom 0.5
  });

  it('counts the interior of hollow shapes and respects the ellipse curve', () => {
    const e = mkShape('ellipse', 0, 0, 100, 100);
    expect(findBindTarget([e], { x: 50, y: 50 }, 1)).toBe(e);
    expect(findBindTarget([e], { x: 2, y: 2 }, 1)).toBeNull(); // bbox corner is ~ 20 px from the curve
  });

  it('honours the exclusion list (ids, null and undefined entries)', () => {
    expect(findBindTarget([box], { x: 50, y: 50 }, 1, [box.id])).toBeNull();
    expect(findBindTarget([box], { x: 50, y: 50 }, 1, [null, undefined, 'x'])).toBe(box);
  });

  it('picks the smallest bounds area, ties go to the top-most', () => {
    const big = mkShape('rectangle', 0, 0, 400, 400);
    const small = mkShape('rectangle', 100, 100, 50, 50);
    expect(findBindTarget([big, small], { x: 120, y: 120 }, 1)).toBe(small);
    expect(findBindTarget([small, big], { x: 120, y: 120 }, 1)).toBe(small);
    const twinA = mkShape('rectangle', 0, 0, 100, 100);
    const twinB = mkShape('rectangle', 0, 0, 100, 100);
    expect(findBindTarget([twinA, twinB], { x: 50, y: 50 }, 1)).toBe(twinB);
  });

  it('binds to text and never to arrows', () => {
    const t = mkText(0, 0, 60, 30);
    const ar = mkArrow({ x: 0, y: 0 }, { x: 100, y: 0 }, null, null);
    expect(findBindTarget([t, ar], { x: 30, y: 15 }, 1)).toBe(t);
    expect(findBindTarget([ar], { x: 50, y: 0 }, 1)).toBeNull();
  });
});

describe('chooseFixedPoint', () => {
  const a = mkShape('rectangle', 300, 300, 160, 100);

  it('is center-directed for shallow or outside points', () => {
    expect(chooseFixedPoint(a, { x: 380, y: 350 }, false)).toEqual([0.5, 0.5]);
    expect(chooseFixedPoint(a, { x: 310, y: 350 }, false)).toEqual([0.5, 0.5]); // depth 10 <= 25
    expect(chooseFixedPoint(a, { x: 200, y: 350 }, false)).toEqual([0.5, 0.5]); // outside
    expect(chooseFixedPoint(a, { x: 200, y: 350 }, true)).toEqual([0.5, 0.5]); // outside, even with Alt
  });

  it('anchors at the exact point when deep inside or when Alt is held', () => {
    expect(chooseFixedPoint(a, { x: 330, y: 330 }, false)).toEqual([0.1875, 0.3]);
    expect(chooseFixedPoint(a, { x: 330, y: 330 }, true)).toEqual([0.1875, 0.3]);
    expect(chooseFixedPoint(a, { x: 310, y: 350 }, true)).toEqual([0.0625, 0.5]);
  });

  it('clamps and handles zero-size dimensions', () => {
    const flat = mkShape('rectangle', 0, 0, 100, 0);
    expect(chooseFixedPoint(flat, { x: 25, y: 0 }, true)[1]).toBe(0.5);
    const ell = mkShape('ellipse', 0, 0, 100, 100);
    const fp = chooseFixedPoint(ell, { x: 99, y: 50 }, true);
    expect(fp[0]).toBeGreaterThanOrEqual(0);
    expect(fp[0]).toBeLessThanOrEqual(1);
  });
});

describe('focusPoint', () => {
  it('maps the ratios onto the bounds', () => {
    const a = mkShape('rectangle', 300, 300, 160, 100);
    expect(focusPoint(a, bind(a))).toEqual({ x: 380, y: 350 });
    expect(focusPoint(a, bind(a, [0, 0]))).toEqual({ x: 300, y: 300 });
    expect(focusPoint(a, bind(a, [1, 0.25]))).toEqual({ x: 460, y: 325 });
  });
});

describe('resolveArrow / updateBoundArrows: orbit placement', () => {
  it('rectangle to rectangle: (466,350) to (794,350) with the 6px gap', () => {
    const A = mkShape('rectangle', 300, 300, 160, 100);
    const B = mkShape('rectangle', 800, 300, 160, 100);
    const arrow = mkArrow({ x: 380, y: 350 }, { x: 880, y: 350 }, bind(A), bind(B));
    const r = route([A, B, arrow]);
    near(r.start, 466, 350);
    near(r.end, 794, 350);
    expect(BIND_GAP + DEFAULT_STYLE.strokeWidth / 2).toBe(6);
  });

  it('after moving B down by 200 the ends follow along the center ray', () => {
    const A = mkShape('rectangle', 300, 300, 160, 100);
    const B = mkShape('rectangle', 800, 500, 160, 100);
    const arrow = mkArrow({ x: 466, y: 350 }, { x: 794, y: 350 }, bind(A), bind(B));
    const r = route([A, B, arrow]);
    near(r.start, 465.57, 384.23, 0.01);
    near(r.end, 794.43, 515.77, 0.01);
  });

  it('the gap uses the target stroke width', () => {
    const A = mkShape('rectangle', 300, 300, 160, 100, {}, { strokeWidth: 4 });
    const B = mkShape('rectangle', 800, 300, 160, 100, {}, { strokeWidth: 1 });
    const r = route([A, B, mkArrow({ x: 0, y: 0 }, { x: 1, y: 1 }, bind(A), bind(B))]);
    near(r.start, 467, 350, 1e-6); // 460 + 5 + 4/2
    near(r.end, 794.5, 350, 1e-6); // 800 - 5 - 1/2
  });

  it.each<[ShapeKind, number, number, number, number]>([
    ['rectangle', 0, 0, 200, 100],
    ['ellipse', 0, 0, 200, 100],
    ['diamond', 0, 0, 200, 100],
    ['triangle', 0, 0, 140, 120],
  ])('%s: the bound end lies on outline + gap along the center ray', (kind, x, y, w, h) => {
    const T = mkShape(kind, x, y, w, h);
    const X = mkShape('rectangle', 600, 400, 100, 100);
    const arrow = mkArrow({ x: 0, y: 0 }, { x: 1, y: 1 }, bind(T), bind(X));
    const r = route([T, X, arrow]);
    const o = getOutline(T);
    // The end sits BIND_GAP + sw/2 beyond the outline, on the ray from the center toward X's center.
    const c = { x: x + w / 2, y: y + h / 2 };
    const toX = { x: 650 - c.x, y: 450 - c.y };
    const hit = rayExit(o, c, toX)!;
    expect(Math.hypot(r.start.x - hit.x, r.start.y - hit.y)).toBeCloseTo(BIND_GAP + 1, 6);
    const cross = (r.start.x - c.x) * toX.y - (r.start.y - c.y) * toX.x;
    expect(Math.abs(cross) / Math.hypot(toX.x, toX.y)).toBeLessThan(0.5);
    expect(distanceToOutline(o, r.start)).toBeGreaterThan(0);
    // And the far end is on X's outline plus gap along the same ray.
    const hitX = rayExit(getOutline(X), { x: 650, y: 450 }, { x: -toX.x, y: -toX.y })!;
    expect(Math.hypot(r.end.x - hitX.x, r.end.y - hitX.y)).toBeCloseTo(BIND_GAP + 1, 6);
  });

  it('triangle exits through its slanted edge: horizontal ray from the bounds center', () => {
    const T = mkShape('triangle', 0, 0, 140, 120);
    const X = mkShape('rectangle', 400, 0, 100, 120);
    const r = route([T, X, mkArrow({ x: 0, y: 0 }, { x: 1, y: 1 }, bind(T), bind(X))]);
    near(r.start, 111, 60); // edge x = 105 at y = 60, plus 6
    near(r.end, 394, 60);
  });

  it('text elements are bound by their bounds', () => {
    const T = mkText(100, 100, 80, 30);
    const X = mkShape('rectangle', 400, 85, 100, 60);
    const r = route([T, X, mkArrow({ x: 0, y: 0 }, { x: 1, y: 1 }, bind(T), bind(X))]);
    near(r.start, 186, 115, 1e-6);
    near(r.end, 394, 115, 1e-6);
  });

  it('a free end stays where it is while the bound end faces it', () => {
    const A = mkShape('rectangle', 300, 300, 160, 100);
    const arrow = mkArrow({ x: 380, y: 350 }, { x: 380, y: 700 }, bind(A), null);
    const r = route([A, arrow]);
    near(r.start, 380, 406, 1e-6);
    expect(r.end).toEqual({ x: 380, y: 700 });
  });

  it('an end pointing at a bound arrow end that is inside the shape falls back to the focus point', () => {
    const A = mkShape('rectangle', 0, 0, 100, 100);
    const B = mkShape('rectangle', 30, 0, 100, 100);
    const r = route([A, B, mkArrow({ x: 0, y: 0 }, { x: 1, y: 1 }, bind(A), bind(B))]);
    expect(r.start).toEqual({ x: 50, y: 50 });
    expect(r.end).toEqual({ x: 80, y: 50 });
  });

  it('falls back to the focus points when the resolved arrow would be shorter than MIN_ARROW_LENGTH', () => {
    const A = mkShape('rectangle', 0, 0, 100, 100);
    const B = mkShape('rectangle', 112, 0, 100, 100); // gap of 12 leaves 0 between the 6px offsets
    const r = route([A, B, mkArrow({ x: 0, y: 0 }, { x: 1, y: 1 }, bind(A), bind(B))]);
    expect(r.start).toEqual({ x: 50, y: 50 });
    expect(r.end).toEqual({ x: 162, y: 50 });
  });

  it('a zero-size target falls back to its focus point; a missing or non-bindable target is ignored', () => {
    const Z = mkShape('rectangle', 100, 100, 0, 0);
    const X = mkShape('rectangle', 400, 0, 100, 100);
    const r = route([Z, X, mkArrow({ x: 0, y: 0 }, { x: 1, y: 1 }, bind(Z), bind(X))]);
    expect(r.start).toEqual({ x: 100, y: 100 });
    const a = mkArrow({ x: 5, y: 5 }, { x: 9, y: 9 }, { elementId: 'gone', fixedPoint: [0.5, 0.5] }, null);
    const other = mkArrow({ x: 0, y: 0 }, { x: 1, y: 1 }, null, null);
    expect(resolveArrow(a, indexById([a]))).toBe(a);
    const c = mkArrow({ x: 5, y: 5 }, { x: 9, y: 9 }, { elementId: other.id, fixedPoint: [0.5, 0.5] }, null);
    expect(resolveArrow(c, indexById([c, other]))).toBe(c);
  });

  it('resolveArrow returns the same object when the ends are already in place', () => {
    const A = mkShape('rectangle', 300, 300, 160, 100);
    const B = mkShape('rectangle', 800, 300, 160, 100);
    const arrow = mkArrow({ x: 466, y: 350 }, { x: 794, y: 350 }, bind(A), bind(B));
    expect(resolveArrow(arrow, indexById([A, B, arrow]))).toBe(arrow);
  });

  it('off-center fixed points aim at that point on the target', () => {
    const A = mkShape('rectangle', 300, 300, 160, 100);
    const B = mkShape('rectangle', 800, 300, 160, 100);
    const arrow = mkArrow({ x: 0, y: 0 }, { x: 1, y: 1 }, bind(A, [0.5, 0.2]), bind(B, [0.5, 0.2]));
    const r = route([A, B, arrow]);
    near(r.start, 466, 320, 1e-6);
    near(r.end, 794, 320, 1e-6);
  });
});

describe('updateBoundArrows', () => {
  const A = mkShape('rectangle', 300, 300, 160, 100);
  const B = mkShape('rectangle', 800, 300, 160, 100);
  const C = mkShape('rectangle', 0, 800, 100, 100);

  it('returns the very same array when nothing changes', () => {
    const arrow = mkArrow({ x: 466, y: 350 }, { x: 794, y: 350 }, bind(A), bind(B));
    const els: ChalkElement[] = [A, B, C, arrow];
    expect(updateBoundArrows(els, null)).toBe(els);
    expect(updateBoundArrows(els, new Set([A.id]))).toBe(els);
    expect(updateBoundArrows([A, B, C], null)).toBeInstanceOf(Array);
    const noArrows: ChalkElement[] = [A, B];
    expect(updateBoundArrows(noArrows, null)).toBe(noArrows);
    expect(updateBoundArrows([], null)).toEqual([]);
  });

  it('only re-routes arrows touched by changedIds, keeping other objects identical', () => {
    const stale1 = mkArrow({ x: 0, y: 0 }, { x: 1, y: 1 }, bind(A), bind(B));
    const stale2 = mkArrow({ x: 0, y: 0 }, { x: 1, y: 1 }, bind(C), null);
    const els: ChalkElement[] = [A, B, C, stale1, stale2];
    const viaA = updateBoundArrows(els, new Set([A.id]));
    expect(viaA).not.toBe(els);
    expect(viaA[3]).not.toBe(stale1);
    expect(viaA[4]).toBe(stale2);
    expect(viaA[0]).toBe(A);
    const viaSelf = updateBoundArrows(els, new Set([stale2.id]));
    expect(viaSelf[3]).toBe(stale1);
    expect(viaSelf[4]).not.toBe(stale2);
    const viaEnd = updateBoundArrows(els, new Set([B.id]));
    expect(viaEnd[3]).not.toBe(stale1);
    const all = updateBoundArrows(els, null);
    expect(all[3]).not.toBe(stale1);
    expect(all[4]).not.toBe(stale2);
    // input is never mutated
    expect(els[3]).toBe(stale1);
  });

  it('follows a resized shape', () => {
    const B2 = { ...B, width: 300 } as ShapeElement; // left edge unchanged, so the end stays; the center moves
    const arrow = mkArrow({ x: 466, y: 350 }, { x: 794, y: 350 }, bind(A), bind(B));
    const out = updateBoundArrows([A, B2, arrow], new Set([B.id]));
    const r = out[2] as ArrowElement;
    near(r.end, 794, 350, 0.01);
    const B3 = { ...B, height: 300 } as ShapeElement; // center moves down to y = 450
    const r3 = updateBoundArrows([A, B3, arrow], new Set([B.id]))[2] as ArrowElement;
    expect(r3.end.y).toBeGreaterThan(350);
    expect(r3.end.x).toBeLessThan(800);
  });
});

describe('unbindFrom', () => {
  const A = mkShape('rectangle', 0, 0, 10, 10);
  const B = mkShape('rectangle', 100, 0, 10, 10);

  it('nulls matching bindings, keeps endpoints and other bindings', () => {
    const arrow = mkArrow({ x: 11, y: 5 }, { x: 99, y: 5 }, bind(A), bind(B));
    const out = unbindFrom([A, B, arrow], new Set([A.id]));
    const r = out[2] as ArrowElement;
    expect(r.startBinding).toBeNull();
    expect(r.endBinding).toEqual(bind(B));
    expect(r.start).toEqual({ x: 11, y: 5 });
    expect(r.end).toEqual({ x: 99, y: 5 });
    expect(out[0]).toBe(A);
    const both = unbindFrom([A, B, arrow], new Set([A.id, B.id]))[2] as ArrowElement;
    expect(both.startBinding).toBeNull();
    expect(both.endBinding).toBeNull();
  });

  it('returns the input array when nothing is bound to ids', () => {
    const arrow = mkArrow({ x: 11, y: 5 }, { x: 99, y: 5 }, bind(A), null);
    const els: ChalkElement[] = [A, B, arrow];
    expect(unbindFrom(els, new Set([B.id]))).toBe(els);
    expect(unbindFrom(els, new Set())).toBe(els);
    expect(unbindFrom([A, B], new Set([A.id]))).toEqual([A, B]);
  });
});
