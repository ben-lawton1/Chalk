// Unit tests for core/geometry: bounds, outlines, hit testing, handles (WP1).
import { describe, expect, it } from 'vitest';
import type { ArrowElement, ChalkElement, Outline, Point, Rect, ShapeElement, ShapeKind, Style, TextElement } from '../types';
import { DEFAULT_STYLE, HIT_TOLERANCE_PX } from '../constants';
import { SHAPES } from './shapes';
import {
  distanceToOutline, elementsInRect, getBounds, getCommonBounds, getHandleMode, getHandlePositions, getOutline,
  getSelectionBox, handlePoint, HANDLE_CURSORS, hitEndpoint, hitHandle, hitTest, hitTestElement, hitTolerance,
  isBindable, isPointInsideOutline, rayExit,
} from './geometry';

const ID_SEQ = { n: 0 };
function mkShape(kind: ShapeKind, x: number, y: number, width: number, height: number, over: Partial<ShapeElement> = {}, style: Partial<Style> = {}): ShapeElement {
  return {
    id: over.id ?? `s${++ID_SEQ.n}`, seed: 1, type: 'shape', shape: kind, x, y, width, height, label: '',
    style: { ...DEFAULT_STYLE, ...style }, ...over,
  };
}
function mkText(x: number, y: number, text: string, over: Partial<TextElement> = {}): TextElement {
  // approxMeasure: 0.6em per char; 24px font -> 14.4 per char, line height 30.
  return {
    id: over.id ?? `t${++ID_SEQ.n}`, seed: 1, type: 'text', x, y, width: text.length * 14.4, height: 30, text, autoResize: true,
    style: { ...DEFAULT_STYLE }, ...over,
  };
}
function mkArrow(start: Point, end: Point, over: Partial<ArrowElement> = {}): ArrowElement {
  return {
    id: over.id ?? `a${++ID_SEQ.n}`, seed: 1, type: 'arrow', start, end, startBinding: null, endBinding: null, label: '',
    style: { ...DEFAULT_STYLE }, ...over,
  };
}
const rectOf = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const near = (p: Point | null, x: number, y: number, eps = 1e-6): void => {
  expect(p).not.toBeNull();
  expect(p!.x).toBeCloseTo(x, -Math.log10(eps));
  expect(p!.y).toBeCloseTo(y, -Math.log10(eps));
};

describe('getBounds / getCommonBounds / isBindable', () => {
  it('returns the own rect for shapes and text', () => {
    expect(getBounds(mkShape('rectangle', 10, 20, 30, 40))).toEqual(rectOf(10, 20, 30, 40));
    const t = mkText(5, 6, 'hey');
    expect(getBounds(t)).toEqual(rectOf(5, 6, t.width, 30));
  });

  it('returns the start-end rect for an arrow without a label (normalized)', () => {
    expect(getBounds(mkArrow({ x: 100, y: 50 }, { x: 20, y: 90 }))).toEqual(rectOf(20, 50, 80, 40));
  });

  it('includes the label box of an arrow', () => {
    // 5 chars * 14.4 = 72 wide, 30 high, centered on the midpoint (0, 0).
    const a = mkArrow({ x: 0, y: 0 }, { x: 0, y: 0 }, { label: 'hello' });
    const b = getBounds(a);
    expect(b.x).toBeCloseTo(-36);
    expect(b.y).toBeCloseTo(-15);
    expect(b.width).toBeCloseTo(72);
    expect(b.height).toBeCloseTo(30);
  });

  it('unions the label box with a long segment', () => {
    const a = mkArrow({ x: 0, y: 0 }, { x: 200, y: 0 }, { label: 'hi' });
    const b = getBounds(a);
    expect(b.x).toBe(0);
    expect(b.width).toBe(200);
    expect(b.y).toBeCloseTo(-15);
    expect(b.height).toBeCloseTo(30);
  });

  it('getCommonBounds is null for [] and a union otherwise', () => {
    expect(getCommonBounds([])).toBeNull();
    const c = getCommonBounds([mkShape('rectangle', 0, 0, 10, 10), mkShape('ellipse', 50, 60, 20, 20)]);
    expect(c).toEqual(rectOf(0, 0, 70, 80));
  });

  it('isBindable is true for shapes and text only', () => {
    expect(isBindable(mkShape('rectangle', 0, 0, 1, 1))).toBe(true);
    expect(isBindable(mkText(0, 0, 'a'))).toBe(true);
    expect(isBindable(mkArrow({ x: 0, y: 0 }, { x: 1, y: 1 }))).toBe(false);
  });
});

describe('outlines', () => {
  it('shape outline comes from the registry; text outline is its bounds', () => {
    const s = mkShape('diamond', 0, 0, 100, 60);
    expect(getOutline(s)).toEqual(SHAPES.diamond.outline(rectOf(0, 0, 100, 60)));
    const t = mkText(10, 10, 'ab');
    const o = getOutline(t);
    expect(o.kind).toBe('polygon');
    if (o.kind === 'polygon') {
      expect(o.points).toEqual([
        { x: 10, y: 10 }, { x: 10 + t.width, y: 10 }, { x: 10 + t.width, y: 40 }, { x: 10, y: 40 },
      ]);
    }
  });

  it('isPointInsideOutline: polygon (rect, diamond, triangle)', () => {
    const rect = getOutline(mkShape('rectangle', 0, 0, 100, 50));
    expect(isPointInsideOutline(rect, { x: 50, y: 25 })).toBe(true);
    expect(isPointInsideOutline(rect, { x: 101, y: 25 })).toBe(false);
    const dia = getOutline(mkShape('diamond', 0, 0, 100, 100));
    expect(isPointInsideOutline(dia, { x: 50, y: 50 })).toBe(true);
    expect(isPointInsideOutline(dia, { x: 5, y: 5 })).toBe(false);
    const tri = getOutline(mkShape('triangle', 0, 0, 100, 100));
    expect(isPointInsideOutline(tri, { x: 50, y: 80 })).toBe(true);
    expect(isPointInsideOutline(tri, { x: 10, y: 20 })).toBe(false);
  });

  it('isPointInsideOutline: ellipse, including zero radius', () => {
    const e = getOutline(mkShape('ellipse', 0, 0, 100, 50));
    expect(isPointInsideOutline(e, { x: 50, y: 25 })).toBe(true);
    expect(isPointInsideOutline(e, { x: 2, y: 2 })).toBe(false);
    expect(isPointInsideOutline(e, { x: 99, y: 25 })).toBe(true);
    expect(isPointInsideOutline({ kind: 'ellipse', cx: 0, cy: 0, rx: 0, ry: 5 }, { x: 0, y: 0 })).toBe(false);
  });

  it('distanceToOutline: polygon and ellipse', () => {
    const rect = getOutline(mkShape('rectangle', 0, 0, 100, 50));
    expect(distanceToOutline(rect, { x: 50, y: 0 })).toBeCloseTo(0);
    expect(distanceToOutline(rect, { x: 50, y: 10 })).toBeCloseTo(10);
    expect(distanceToOutline(rect, { x: 50, y: -7 })).toBeCloseTo(7);
    expect(distanceToOutline(rect, { x: 110, y: 25 })).toBeCloseTo(10);
    const e: Outline = { kind: 'ellipse', cx: 0, cy: 0, rx: 50, ry: 25 };
    expect(distanceToOutline(e, { x: 50, y: 0 })).toBeCloseTo(0);
    expect(distanceToOutline(e, { x: 0, y: 0 })).toBeCloseTo(25); // |0 - 1| * min(rx, ry)
    expect(distanceToOutline({ kind: 'ellipse', cx: 3, cy: 4, rx: 0, ry: 5 }, { x: 0, y: 0 })).toBeCloseTo(5);
  });
});

describe('rayExit', () => {
  it('rectangle from the center in the four axis directions', () => {
    const o = getOutline(mkShape('rectangle', 300, 300, 160, 100));
    near(rayExit(o, { x: 380, y: 350 }, { x: 1, y: 0 }), 460, 350);
    near(rayExit(o, { x: 380, y: 350 }, { x: -1, y: 0 }), 300, 350);
    near(rayExit(o, { x: 380, y: 350 }, { x: 0, y: 1 }), 380, 400);
    near(rayExit(o, { x: 380, y: 350 }, { x: 0, y: -1 }), 380, 300);
  });

  it('rectangle off-center and diagonal', () => {
    const o = getOutline(mkShape('rectangle', 0, 0, 100, 100));
    near(rayExit(o, { x: 20, y: 20 }, { x: 1, y: 1 }), 100, 100);
    near(rayExit(o, { x: 80, y: 50 }, { x: 5, y: 0 }), 100, 50); // non-unit direction
    near(rayExit(o, { x: 50, y: 50 }, { x: 500, y: 200 }), 100, 70);
  });

  it('diamond', () => {
    const o = getOutline(mkShape('diamond', 0, 0, 100, 100));
    near(rayExit(o, { x: 50, y: 50 }, { x: 1, y: 0 }), 100, 50);
    near(rayExit(o, { x: 50, y: 50 }, { x: 1, y: 1 }), 75, 75);
    near(rayExit(o, { x: 40, y: 50 }, { x: 1, y: 0 }), 100, 50);
  });

  it('ellipse from the center and off-center', () => {
    const o = getOutline(mkShape('ellipse', 0, 0, 200, 100));
    near(rayExit(o, { x: 100, y: 50 }, { x: 1, y: 0 }), 200, 50);
    near(rayExit(o, { x: 100, y: 50 }, { x: 0, y: -1 }), 100, 0);
    near(rayExit(o, { x: 100, y: 50 }, { x: -3, y: 0 }), 0, 50);
    near(rayExit(o, { x: 150, y: 50 }, { x: 1, y: 0 }), 200, 50);
    const hit = rayExit(o, { x: 100, y: 50 }, { x: 1, y: 1 })!;
    expect(((hit.x - 100) / 100) ** 2 + ((hit.y - 50) / 50) ** 2).toBeCloseTo(1, 9);
  });

  it('triangle', () => {
    const o = getOutline(mkShape('triangle', 0, 0, 100, 100));
    near(rayExit(o, { x: 50, y: 60 }, { x: 0, y: 1 }), 50, 100);
    near(rayExit(o, { x: 50, y: 60 }, { x: 0, y: -1 }), 50, 0);
    // Right slanted edge runs (50,0)-(100,100): at y = 60, x = 80.
    near(rayExit(o, { x: 50, y: 60 }, { x: 1, y: 0 }), 80, 60);
    near(rayExit(o, { x: 50, y: 60 }, { x: -1, y: 0 }), 20, 60);
  });

  it('returns the farthest crossing when the origin is outside', () => {
    const o = getOutline(mkShape('rectangle', 100, 0, 100, 100));
    near(rayExit(o, { x: 0, y: 50 }, { x: 1, y: 0 }), 200, 50);
  });

  it('degenerate cases return null', () => {
    const o = getOutline(mkShape('rectangle', 0, 0, 100, 100));
    expect(rayExit(o, { x: 50, y: 50 }, { x: 0, y: 0 })).toBeNull();
    expect(rayExit(o, { x: 200, y: 50 }, { x: 1, y: 0 })).toBeNull(); // pointing away
    expect(rayExit({ kind: 'ellipse', cx: 0, cy: 0, rx: 0, ry: 10 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
    expect(rayExit({ kind: 'ellipse', cx: 0, cy: 0, rx: 10, ry: 10 }, { x: 50, y: 50 }, { x: 1, y: 0 })).toBeNull(); // misses
    expect(rayExit({ kind: 'ellipse', cx: 0, cy: 0, rx: 10, ry: 10 }, { x: 50, y: 0 }, { x: 1, y: 0 })).toBeNull(); // behind
    expect(rayExit({ kind: 'polygon', points: [{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 }] }, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });
});

describe('hit testing', () => {
  it('hitTolerance scales with zoom and respects stroke width', () => {
    const s = mkShape('rectangle', 0, 0, 10, 10, {}, { strokeWidth: 2 });
    expect(hitTolerance(s, 1)).toBe(HIT_TOLERANCE_PX);
    expect(hitTolerance(s, 2)).toBe(HIT_TOLERANCE_PX / 2);
    expect(hitTolerance(s, 0.5)).toBe(HIT_TOLERANCE_PX * 2);
    const thick = mkShape('rectangle', 0, 0, 10, 10, {}, { strokeWidth: 40 });
    expect(hitTolerance(thick, 4)).toBe(20);
  });

  it('shape: stroke is strong, empty interior is hollow, filled or labelled interior is strong', () => {
    const hollow = mkShape('rectangle', 100, 100, 200, 200);
    expect(hitTestElement(hollow, { x: 100, y: 200 }, 1)).toBe('strong');
    expect(hitTestElement(hollow, { x: 104, y: 200 }, 1)).toBe('strong');
    expect(hitTestElement(hollow, { x: 200, y: 200 }, 1)).toBe('hollow');
    expect(hitTestElement(hollow, { x: 50, y: 200 }, 1)).toBeNull();
    const filled = mkShape('rectangle', 100, 100, 200, 200, {}, { backgroundColor: '#ffc9c9' });
    expect(hitTestElement(filled, { x: 200, y: 200 }, 1)).toBe('strong');
    const labelled = mkShape('rectangle', 100, 100, 200, 200, { label: 'x' });
    expect(hitTestElement(labelled, { x: 200, y: 200 }, 1)).toBe('strong');
  });

  it('tolerance grows when zoomed out and shrinks when zoomed in', () => {
    const s = mkShape('rectangle', 100, 100, 200, 200);
    const p = { x: 100 - 6, y: 200 };
    expect(hitTestElement(s, p, 1)).toBe('strong'); // 6 <= 8
    expect(hitTestElement(s, p, 4)).toBeNull(); // tol = 2
    expect(hitTestElement(s, { x: 100 - 15, y: 200 }, 0.5)).toBe('strong'); // tol = 16
  });

  it('ellipse and diamond hit on the curve', () => {
    const e = mkShape('ellipse', 0, 0, 200, 100);
    expect(hitTestElement(e, { x: 200, y: 50 }, 1)).toBe('strong');
    expect(hitTestElement(e, { x: 100, y: 50 }, 1)).toBe('hollow');
    expect(hitTestElement(e, { x: 4, y: 4 }, 1)).toBeNull(); // corner of the bbox is outside
    const d = mkShape('diamond', 0, 0, 100, 100);
    expect(hitTestElement(d, { x: 25, y: 25 }, 1)).toBe('strong'); // on the edge
    expect(hitTestElement(d, { x: 2, y: 2 }, 1)).toBeNull();
  });

  it('text is strong inside its bounds expanded by the tolerance', () => {
    const t = mkText(100, 100, 'hello');
    expect(hitTestElement(t, { x: 120, y: 110 }, 1)).toBe('strong');
    expect(hitTestElement(t, { x: 96, y: 110 }, 1)).toBe('strong');
    expect(hitTestElement(t, { x: 60, y: 110 }, 1)).toBeNull();
  });

  it('arrow: near the segment, or on its label box', () => {
    const a = mkArrow({ x: 0, y: 0 }, { x: 200, y: 0 });
    expect(hitTestElement(a, { x: 100, y: 5 }, 1)).toBe('strong');
    expect(hitTestElement(a, { x: 100, y: 20 }, 1)).toBeNull();
    expect(hitTestElement(a, { x: 250, y: 0 }, 1)).toBeNull();
    const b = mkArrow({ x: 0, y: 0 }, { x: 200, y: 0 }, { label: 'hello' });
    // label box: 72 x 30 centered at (100, 0) plus 4 padding => y up to 19
    expect(hitTestElement(b, { x: 100, y: 18 }, 1)).toBe('strong');
    expect(hitTestElement(b, { x: 100, y: 30 }, 1)).toBeNull();
  });

  it('hitTest returns the top-most strong hit', () => {
    const lower = mkShape('rectangle', 0, 0, 100, 100, {}, { backgroundColor: '#ffc9c9' });
    const upper = mkShape('rectangle', 50, 50, 100, 100, {}, { backgroundColor: '#b2f2bb' });
    const r = hitTest([lower, upper], { x: 75, y: 75 }, 1)!;
    expect(r.element.id).toBe(upper.id);
    expect(r.hollow).toBe(false);
    expect(hitTest([upper, lower], { x: 75, y: 75 }, 1)!.element.id).toBe(lower.id);
  });

  it('hitTest prefers a strong hit over a hollow hit that is higher in z-order', () => {
    const filledBottom = mkShape('rectangle', 0, 0, 100, 100, {}, { backgroundColor: '#ffc9c9' });
    const hollowTop = mkShape('rectangle', 0, 0, 100, 100);
    const r = hitTest([filledBottom, hollowTop], { x: 50, y: 50 }, 1)!;
    expect(r.element.id).toBe(filledBottom.id);
    expect(r.hollow).toBe(false);
  });

  it('hitTest picks the smallest hollow shape (nested frames) and top-most on ties', () => {
    const big = mkShape('rectangle', 0, 0, 400, 400);
    const small = mkShape('rectangle', 100, 100, 100, 100);
    const r1 = hitTest([big, small], { x: 150, y: 150 }, 1)!;
    expect(r1.element.id).toBe(small.id);
    expect(r1.hollow).toBe(true);
    expect(hitTest([small, big], { x: 150, y: 150 }, 1)!.element.id).toBe(small.id);
    const twinA = mkShape('rectangle', 0, 0, 100, 100);
    const twinB = mkShape('rectangle', 0, 0, 100, 100);
    expect(hitTest([twinA, twinB], { x: 50, y: 50 }, 1)!.element.id).toBe(twinB.id);
  });

  it('a stroke hit inside a hollow parent beats the parent interior', () => {
    const frame = mkShape('rectangle', 0, 0, 400, 400);
    const inner = mkShape('rectangle', 100, 100, 100, 100);
    const r = hitTest([frame, inner], { x: 100, y: 150 }, 1)!; // on inner's left stroke
    expect(r.element.id).toBe(inner.id);
    expect(r.hollow).toBe(false);
  });

  it('hitTest returns null on empty space', () => {
    expect(hitTest([], { x: 0, y: 0 }, 1)).toBeNull();
    expect(hitTest([mkShape('rectangle', 0, 0, 10, 10)], { x: 500, y: 500 }, 1)).toBeNull();
  });
});

describe('elementsInRect', () => {
  it('returns ids of fully-contained elements in z-order', () => {
    const a = mkShape('rectangle', 10, 10, 20, 20);
    const b = mkShape('rectangle', 40, 10, 20, 20);
    const c = mkShape('rectangle', 70, 10, 100, 20);
    const arrow = mkArrow({ x: 15, y: 15 }, { x: 55, y: 25 });
    const els: ChalkElement[] = [b, a, c, arrow];
    expect(elementsInRect(els, rectOf(0, 0, 100, 100))).toEqual([b.id, a.id, arrow.id]);
    expect(elementsInRect(els, rectOf(10, 10, 20, 20))).toEqual([a.id]); // inclusive
    expect(elementsInRect(els, rectOf(11, 10, 100, 100))).not.toContain(a.id);
    expect(elementsInRect(els, rectOf(500, 500, 10, 10))).toEqual([]);
  });
});

describe('selection and handles', () => {
  const shape = mkShape('rectangle', 0, 0, 100, 100, { id: 'sh' });
  const text = mkText(0, 0, 'hi', { id: 'tx' });
  const arrow = mkArrow({ x: 0, y: 0 }, { x: 50, y: 50 }, { id: 'ar' });
  const els: ChalkElement[] = [shape, text, arrow];

  it('getHandleMode', () => {
    expect(getHandleMode(els, [])).toBe('none');
    expect(getHandleMode(els, ['missing'])).toBe('none');
    expect(getHandleMode(els, ['ar'])).toBe('endpoints');
    expect(getHandleMode(els, ['tx'])).toBe('text');
    expect(getHandleMode(els, ['sh'])).toBe('box');
    expect(getHandleMode(els, ['sh', 'tx'])).toBe('box');
    expect(getHandleMode(els, ['ar', 'sh'])).toBe('box');
    expect(getHandleMode(els, ['ar', 'missing'])).toBe('endpoints'); // only existing elements count
  });

  it('getSelectionBox is the unpadded common bounds, or null', () => {
    expect(getSelectionBox(els, [])).toBeNull();
    expect(getSelectionBox(els, ['sh'])).toEqual(rectOf(0, 0, 100, 100));
    expect(getSelectionBox(els, ['ar', 'tx'])).toEqual(rectOf(0, 0, 50, 50));
  });

  it('handlePoint', () => {
    const box = rectOf(10, 20, 100, 60);
    expect(handlePoint(box, 'nw')).toEqual({ x: 10, y: 20 });
    expect(handlePoint(box, 'n')).toEqual({ x: 60, y: 20 });
    expect(handlePoint(box, 'ne')).toEqual({ x: 110, y: 20 });
    expect(handlePoint(box, 'e')).toEqual({ x: 110, y: 50 });
    expect(handlePoint(box, 'se')).toEqual({ x: 110, y: 80 });
    expect(handlePoint(box, 's')).toEqual({ x: 60, y: 80 });
    expect(handlePoint(box, 'sw')).toEqual({ x: 10, y: 80 });
    expect(handlePoint(box, 'w')).toEqual({ x: 10, y: 50 });
  });

  it('getHandlePositions: box mode has 8 handles on the padded box, in screen space', () => {
    const pos = getHandlePositions(rectOf(0, 0, 100, 100), { scrollX: 0, scrollY: 0, zoom: 1 }, 'box');
    expect(Object.keys(pos).sort()).toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w']);
    expect(pos.nw).toEqual({ x: -4, y: -4 });
    expect(pos.se).toEqual({ x: 104, y: 104 });
    expect(pos.n).toEqual({ x: 50, y: -4 });
    expect(pos.w).toEqual({ x: -4, y: 50 });
  });

  it('getHandlePositions: scroll and zoom map to screen with constant pixel padding', () => {
    const pos = getHandlePositions(rectOf(100, 100, 100, 100), { scrollX: 10, scrollY: -20, zoom: 2 }, 'box');
    // padded = expand 4 / 2 = 2 => (98, 98) to (202, 202); screen = (w + scroll) * 2
    expect(pos.nw).toEqual({ x: (98 + 10) * 2, y: (98 - 20) * 2 });
    expect(pos.se).toEqual({ x: (202 + 10) * 2, y: (202 - 20) * 2 });
  });

  it('getHandlePositions: side handles are hidden when the box is small on screen', () => {
    const v = { scrollX: 0, scrollY: 0, zoom: 1 };
    const narrow = getHandlePositions(rectOf(0, 0, 10, 100), v, 'box'); // padded 18 wide
    expect(narrow.n).toBeUndefined();
    expect(narrow.s).toBeUndefined();
    expect(narrow.e).toBeDefined();
    expect(narrow.w).toBeDefined();
    const short = getHandlePositions(rectOf(0, 0, 100, 10), v, 'box');
    expect(short.e).toBeUndefined();
    expect(short.w).toBeUndefined();
    expect(short.n).toBeDefined();
    const tiny = getHandlePositions(rectOf(0, 0, 5, 5), v, 'box');
    expect(Object.keys(tiny).sort()).toEqual(['ne', 'nw', 'se', 'sw']);
    // Zooming out shrinks the screen size of a box
    const zoomedOut = getHandlePositions(rectOf(0, 0, 100, 100), { scrollX: 0, scrollY: 0, zoom: 0.2 }, 'box');
    expect(zoomedOut.n).toBeUndefined();
  });

  it('getHandlePositions: text mode has 4 corners plus e/w, always', () => {
    const v = { scrollX: 0, scrollY: 0, zoom: 1 };
    const pos = getHandlePositions(rectOf(0, 0, 8, 8), v, 'text');
    expect(Object.keys(pos).sort()).toEqual(['e', 'ne', 'nw', 'se', 'sw', 'w']);
    expect(pos.n).toBeUndefined();
    expect(pos.s).toBeUndefined();
  });

  it('hitHandle finds handles within HANDLE_HIT_PX / 2 (Chebyshev), corners first', () => {
    const v = { scrollX: 0, scrollY: 0, zoom: 1 };
    const box = rectOf(0, 0, 100, 100);
    expect(hitHandle(box, { x: -4, y: -4 }, v, 'box')).toBe('nw');
    expect(hitHandle(box, { x: 104 + 6, y: 104 - 6 }, v, 'box')).toBe('se');
    expect(hitHandle(box, { x: 104 + 7, y: 104 }, v, 'box')).toBeNull();
    expect(hitHandle(box, { x: 50, y: -4 }, v, 'box')).toBe('n');
    expect(hitHandle(box, { x: 104, y: 50 }, v, 'box')).toBe('e');
    expect(hitHandle(box, { x: 50, y: 50 }, v, 'box')).toBeNull();
    // With overlapping handles on a tiny box, corners win over (hidden) sides.
    expect(hitHandle(rectOf(0, 0, 4, 4), { x: 2, y: -4 }, v, 'box')).toBe('nw');
  });

  it('hitHandle in text mode reaches e/w and not n/s', () => {
    const v = { scrollX: 0, scrollY: 0, zoom: 1 };
    const box = rectOf(0, 0, 60, 30);
    expect(hitHandle(box, { x: 64, y: 15 }, v, 'text')).toBe('e');
    expect(hitHandle(box, { x: -4, y: 15 }, v, 'text')).toBe('w');
    expect(hitHandle(box, { x: 30, y: -4 }, v, 'text')).toBeNull();
  });

  it('hitEndpoint picks the nearer end within range, ties go to end', () => {
    const v = { scrollX: 0, scrollY: 0, zoom: 1 };
    const a = mkArrow({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(hitEndpoint(a, { x: 3, y: 4 }, v)).toBe('start');
    expect(hitEndpoint(a, { x: 98, y: -3 }, v)).toBe('end');
    expect(hitEndpoint(a, { x: 50, y: 0 }, v)).toBeNull();
    expect(hitEndpoint(a, { x: 0, y: 11 }, v)).toBeNull();
    const zero = mkArrow({ x: 10, y: 10 }, { x: 10, y: 10 });
    expect(hitEndpoint(zero, { x: 10, y: 10 }, v)).toBe('end');
    // Zoom: the hit radius is in screen px.
    const z = { scrollX: 0, scrollY: 0, zoom: 2 };
    expect(hitEndpoint(a, { x: 200 + 9, y: 0 }, z)).toBe('end');
    expect(hitEndpoint(a, { x: 100 + 9, y: 0 }, z)).toBeNull();
  });

  it('HANDLE_CURSORS', () => {
    expect(HANDLE_CURSORS.nw).toBe('nwse-resize');
    expect(HANDLE_CURSORS.se).toBe('nwse-resize');
    expect(HANDLE_CURSORS.ne).toBe('nesw-resize');
    expect(HANDLE_CURSORS.sw).toBe('nesw-resize');
    expect(HANDLE_CURSORS.n).toBe('ns-resize');
    expect(HANDLE_CURSORS.s).toBe('ns-resize');
    expect(HANDLE_CURSORS.e).toBe('ew-resize');
    expect(HANDLE_CURSORS.w).toBe('ew-resize');
  });
});
