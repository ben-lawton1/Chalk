// Unit tests for core/scene: creation and pure scene operations (WP1).
import { describe, expect, it } from 'vitest';
import type { ArrowElement, Binding, ChalkElement, HandleId, Point, ShapeElement, ShapeKind, Style, TextElement } from '../types';
import { DEFAULT_STYLE, MAX_FONT_SIZE, MIN_FONT_SIZE, MIN_SHAPE_SIZE } from '../constants';
import { isValidSeed } from './ids';
import { requiredShapeHeight } from './text';
import {
  addElements, applyStyleToElements, cloneWithNewIds, createArrow, createShape, createText, duplicateElements, fitShapeToLabel,
  getElement, getElementText, moveElements, removeElements, reorderElements, replaceElement, resizeElements, setArrowEndpoint,
  setElementText, shapeRectFromDrag,
} from './scene';

const NO = { shift: false, alt: false };
let seq = 0;
function mkShape(id: string, x: number, y: number, width: number, height: number, over: Partial<ShapeElement> = {}, style: Partial<Style> = {}, kind: ShapeKind = 'rectangle'): ShapeElement {
  return { id, seed: 1, type: 'shape', shape: kind, x, y, width, height, label: '', style: { ...DEFAULT_STYLE, ...style }, ...over };
}
// 24px font, approx measurer: 14.4 px per char, 30 px line height.
function mkText(id: string, x: number, y: number, text: string, over: Partial<TextElement> = {}, style: Partial<Style> = {}): TextElement {
  return { id, seed: 1, type: 'text', x, y, width: text.length * 14.4, height: 30, text, autoResize: true, style: { ...DEFAULT_STYLE, ...style }, ...over };
}
function bind(id: string, fixedPoint: [number, number] = [0.5, 0.5]): Binding {
  return { elementId: id, fixedPoint };
}
function mkArrow(id: string, start: Point, end: Point, sb: Binding | null = null, eb: Binding | null = null, over: Partial<ArrowElement> = {}): ArrowElement {
  seq++;
  return { id, seed: 1, type: 'arrow', start, end, startBinding: sb, endBinding: eb, label: '', style: { ...DEFAULT_STYLE }, ...over };
}
function rect(el: ChalkElement): { x: number; y: number; width: number; height: number } {
  if (el.type === 'arrow') throw new Error('not a rect');
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}
function get<T extends ChalkElement>(els: readonly ChalkElement[], id: string): T {
  const el = getElement(els, id);
  if (!el) throw new Error(`missing ${id}`);
  return el as T;
}
function expectPoint(p: Point, x: number, y: number, digits = 6): void {
  expect(p.x).toBeCloseTo(x, digits);
  expect(p.y).toBeCloseTo(y, digits);
}

/** The spec's tools.test geometry: A = {300,300,160,100}, B = {800,300,160,100}, arrow bound A -> B. */
function abScene(): { A: ShapeElement; B: ShapeElement; arrow: ArrowElement; els: ChalkElement[] } {
  const A = mkShape('A', 300, 300, 160, 100);
  const B = mkShape('B', 800, 300, 160, 100);
  const arrow = mkArrow('ar', { x: 466, y: 350 }, { x: 794, y: 350 }, bind('A'), bind('B'));
  return { A, B, arrow, els: [A, B, arrow] };
}

describe('creation and lookup', () => {
  it('createShape: id, seed, label, size floor, style copy', () => {
    const s = createShape('ellipse', { x: 1, y: 2, width: 0, height: 3 }, DEFAULT_STYLE);
    expect(s.type).toBe('shape');
    expect(s.shape).toBe('ellipse');
    expect(s.id).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(isValidSeed(s.seed)).toBe(true);
    expect(s.label).toBe('');
    expect(s.width).toBe(MIN_SHAPE_SIZE);
    expect(s.height).toBe(MIN_SHAPE_SIZE);
    expect(s.x).toBe(1);
    expect(s.style).toEqual(DEFAULT_STYLE);
    expect(s.style).not.toBe(DEFAULT_STYLE);
    expect(createShape('rectangle', { x: 0, y: 0, width: 160, height: 100 }, DEFAULT_STYLE).id).not.toBe(s.id);
  });

  it('createText measures and auto-sizes', () => {
    const t = createText({ x: 10, y: 20 }, 'hello', DEFAULT_STYLE);
    expect(t.autoResize).toBe(true);
    expect(t.x).toBe(10);
    expect(t.y).toBe(20);
    expect(t.width).toBeCloseTo(72);
    expect(t.height).toBeCloseTo(30);
    const two = createText({ x: 0, y: 0 }, 'ab\ncdef', DEFAULT_STYLE);
    expect(two.width).toBeCloseTo(4 * 14.4);
    expect(two.height).toBeCloseTo(60);
    const empty = createText({ x: 0, y: 0 }, '', DEFAULT_STYLE);
    expect(empty.width).toBeGreaterThan(0);
    expect(empty.height).toBeCloseTo(30);
  });

  it('createArrow: unbound, empty label, copies the points', () => {
    const s = { x: 1, y: 2 };
    const a = createArrow(s, { x: 3, y: 4 }, DEFAULT_STYLE);
    expect(a.startBinding).toBeNull();
    expect(a.endBinding).toBeNull();
    expect(a.label).toBe('');
    expect(a.start).toEqual(s);
    expect(a.start).not.toBe(s);
    expect(isValidSeed(a.seed)).toBe(true);
  });

  it('getElement / getElementText', () => {
    const s = mkShape('s', 0, 0, 10, 10, { label: 'L' });
    const t = mkText('t', 0, 0, 'T');
    const a = mkArrow('a', { x: 0, y: 0 }, { x: 1, y: 1 }, null, null, { label: 'AL' });
    expect(getElement([s, t, a], 't')).toBe(t);
    expect(getElement([s, t, a], 'nope')).toBeUndefined();
    expect(getElementText(s)).toBe('L');
    expect(getElementText(t)).toBe('T');
    expect(getElementText(a)).toBe('AL');
  });
});

describe('addElements / replaceElement', () => {
  const a = mkShape('a', 0, 0, 10, 10);
  const b = mkShape('b', 20, 0, 10, 10);

  it('addElements appends on top and does not mutate', () => {
    const base = [a];
    const out = addElements(base, [b]);
    expect(out).toEqual([a, b]);
    expect(base).toEqual([a]);
    expect(addElements(base, [])).toBe(base);
  });

  it('replaceElement keeps z-position; returns the input when the id is missing or the object is the same', () => {
    const base: ChalkElement[] = [a, b];
    const b2 = { ...b, x: 99 };
    const out = replaceElement(base, b2);
    expect(out).toEqual([a, b2]);
    expect(out[0]).toBe(a);
    expect(replaceElement(base, mkShape('zzz', 0, 0, 1, 1))).toBe(base);
    expect(replaceElement(base, b)).toBe(base);
  });
});

describe('removeElements', () => {
  it('removes and unbinds; arrows survive with frozen endpoints', () => {
    const { els } = abScene();
    const out = removeElements(els, ['B']);
    expect(out.map((e) => e.id)).toEqual(['A', 'ar']);
    const ar = get<ArrowElement>(out, 'ar');
    expect(ar.endBinding).toBeNull();
    expect(ar.startBinding).toEqual(bind('A'));
    expect(ar.end).toEqual({ x: 794, y: 350 });
    expect(ar.start).toEqual({ x: 466, y: 350 });
  });

  it('removing both targets unbinds both ends; removing the arrow leaves the shapes alone', () => {
    const { els } = abScene();
    const ar = get<ArrowElement>(removeElements(els, ['A', 'B']), 'ar');
    expect(ar.startBinding).toBeNull();
    expect(ar.endBinding).toBeNull();
    const out = removeElements(els, ['ar']);
    expect(out.map((e) => e.id)).toEqual(['A', 'B']);
    expect(out[0]).toBe(els[0]);
  });

  it('returns the input array when nothing is removed', () => {
    const { els } = abScene();
    expect(removeElements(els, [])).toBe(els);
    expect(removeElements(els, ['nope'])).toBe(els);
  });
});

describe('moveElements', () => {
  it('returns the input array for no ids, zero delta or unknown ids', () => {
    const { els } = abScene();
    expect(moveElements(els, [], 5, 5)).toBe(els);
    expect(moveElements(els, ['A'], 0, 0)).toBe(els);
    expect(moveElements(els, ['nope'], 5, 5)).toBe(els);
  });

  it('translates shapes and text and leaves other objects alone', () => {
    const s = mkShape('s', 10, 10, 50, 50);
    const t = mkText('t', 100, 100, 'hi');
    const o = mkShape('o', 0, 0, 5, 5);
    const out = moveElements([s, t, o], ['s', 't'], 7, -3);
    expect(rect(out[0]!)).toMatchObject({ x: 17, y: 7, width: 50, height: 50 });
    expect(rect(out[1]!)).toMatchObject({ x: 107, y: 97 });
    expect(out[2]).toBe(o);
    expect(s.x).toBe(10); // input untouched
  });

  it('moving only a bound arrow unbinds both ends and moves it freely', () => {
    const { els } = abScene();
    const out = moveElements(els, ['ar'], 0, -60);
    const ar = get<ArrowElement>(out, 'ar');
    expect(ar.startBinding).toBeNull();
    expect(ar.endBinding).toBeNull();
    expect(ar.start).toEqual({ x: 466, y: 290 });
    expect(ar.end).toEqual({ x: 794, y: 290 });
    expect(out[0]).toBe(els[0]);
  });

  it('moving the arrow with both shapes keeps the bindings', () => {
    const { els } = abScene();
    const out = moveElements(els, ['A', 'B', 'ar'], 0, 50);
    expect(rect(get(out, 'A')).y).toBe(350);
    expect(rect(get(out, 'B')).y).toBe(350);
    const ar = get<ArrowElement>(out, 'ar');
    expect(ar.startBinding).toEqual(bind('A'));
    expect(ar.endBinding).toEqual(bind('B'));
    expectPoint(ar.start, 466, 400);
    expectPoint(ar.end, 794, 400);
  });

  it('moving the arrow with only one of its shapes unbinds the other end and freezes it', () => {
    const { els } = abScene();
    const out = moveElements(els, ['A', 'ar'], 0, 100);
    const ar = get<ArrowElement>(out, 'ar');
    expect(ar.startBinding).toEqual(bind('A'));
    expect(ar.endBinding).toBeNull();
    expect(ar.end).toEqual({ x: 794, y: 450 });
    // The bound start re-aims at the frozen end.
    expect(ar.start.x).toBeGreaterThan(460);
    expect(ar.start.y).toBeGreaterThan(400);
  });

  it('moving a shape re-routes arrows bound to it (A to B, B moved down 200)', () => {
    const { els } = abScene();
    const out = moveElements(els, ['B'], 0, 200);
    expect(rect(get(out, 'B')).y).toBe(500);
    const ar = get<ArrowElement>(out, 'ar');
    expect(ar.endBinding).toEqual(bind('B'));
    expectPoint(ar.start, 465.57, 384.23, 2);
    expectPoint(ar.end, 794.43, 515.77, 2);
    // moving it back restores the original geometry
    const back = moveElements(out, ['B'], 0, -200);
    const ar2 = get<ArrowElement>(back, 'ar');
    expectPoint(ar2.start, 466, 350, 6);
    expectPoint(ar2.end, 794, 350, 6);
  });
});

describe('resizeElements: single shape, every handle', () => {
  const R = mkShape('r', 100, 100, 100, 100);
  const resize = (handle: HandleId, x: number, y: number, mods = NO): ChalkElement => get(resizeElements([R], ['r'], handle, { x, y }, mods), 'r');

  it('corner handles', () => {
    expect(rect(resize('se', 250, 300))).toEqual({ x: 100, y: 100, width: 150, height: 200 });
    expect(rect(resize('nw', 50, 60))).toEqual({ x: 50, y: 60, width: 150, height: 140 });
    expect(rect(resize('ne', 250, 50))).toEqual({ x: 100, y: 50, width: 150, height: 150 });
    expect(rect(resize('sw', 60, 250))).toEqual({ x: 60, y: 100, width: 140, height: 150 });
  });

  it('side handles change only one axis', () => {
    expect(rect(resize('e', 260, 999))).toEqual({ x: 100, y: 100, width: 160, height: 100 });
    expect(rect(resize('w', 60, -999))).toEqual({ x: 60, y: 100, width: 140, height: 100 });
    expect(rect(resize('s', -999, 260))).toEqual({ x: 100, y: 100, width: 100, height: 160 });
    expect(rect(resize('n', 999, 60))).toEqual({ x: 100, y: 60, width: 100, height: 140 });
  });

  it('flips when dragged past the opposite edge', () => {
    expect(rect(resize('e', 50, 150))).toEqual({ x: 50, y: 100, width: 50, height: 100 });
    expect(rect(resize('se', 50, 50))).toEqual({ x: 50, y: 50, width: 50, height: 50 });
    expect(rect(resize('nw', 260, 260))).toEqual({ x: 200, y: 200, width: 60, height: 60 });
  });

  it('never shrinks below MIN_SHAPE_SIZE, even at the anchor', () => {
    expect(rect(resize('se', 101, 101))).toMatchObject({ width: MIN_SHAPE_SIZE, height: MIN_SHAPE_SIZE });
    expect(rect(resize('se', 100, 100))).toMatchObject({ width: MIN_SHAPE_SIZE, height: MIN_SHAPE_SIZE });
    expect(rect(resize('e', 100, 150))).toMatchObject({ width: MIN_SHAPE_SIZE, height: 100 });
  });

  it('Shift keeps the aspect ratio (corners: the larger scale wins; sides scale the other axis about the center)', () => {
    expect(rect(resize('se', 250, 120, { shift: true, alt: false }))).toEqual({ x: 100, y: 100, width: 150, height: 150 });
    expect(rect(resize('e', 300, 150, { shift: true, alt: false }))).toEqual({ x: 100, y: 50, width: 200, height: 200 });
    const wide = mkShape('w', 0, 0, 200, 100);
    const out = get<ShapeElement>(resizeElements([wide], ['w'], 'se', { x: 400, y: 100 }, { shift: true, alt: false }), 'w');
    expect(out.width / out.height).toBeCloseTo(2);
  });

  it('Alt resizes about the center', () => {
    expect(rect(resize('se', 250, 250, { shift: false, alt: true }))).toEqual({ x: 50, y: 50, width: 200, height: 200 });
    expect(rect(resize('e', 250, 0, { shift: false, alt: true }))).toEqual({ x: 50, y: 100, width: 200, height: 100 });
  });

  it('works on diamonds, ellipses and triangles and preserves non-geometry fields', () => {
    const d = mkShape('d', 0, 0, 100, 100, { label: 'x', seed: 77 }, { strokeColor: '#e03131' }, 'diamond');
    const out = get<ShapeElement>(resizeElements([d], ['d'], 'se', { x: 200, y: 200 }, NO), 'd');
    expect(out.shape).toBe('diamond');
    expect(out.seed).toBe(77);
    expect(out.style.strokeColor).toBe('#e03131');
    expect(rect(out)).toMatchObject({ width: 200, height: 200 });
  });

  it('empty or unknown ids return the input array', () => {
    const base = [R];
    expect(resizeElements(base, [], 'se', { x: 5, y: 5 }, NO)).toBe(base);
    expect(resizeElements(base, ['nope'], 'se', { x: 5, y: 5 }, NO)).toBe(base);
  });
});

describe('resizeElements: labelled shapes', () => {
  const label = 'aaaaaaaaaaaa bbbbbbbbbbbb'; // two 172.8px lines in a 184px label box
  const S = mkShape('s', 0, 0, 200, 100, { label });

  it('never shrinks below the label height; the bottom stays fixed when the top handle is dragged', () => {
    const need = requiredShapeHeight(S);
    expect(need).toBeCloseTo(76);
    const south = get<ShapeElement>(resizeElements([S], ['s'], 's', { x: 100, y: 20 }, NO), 's');
    expect(south.height).toBeCloseTo(need);
    expect(south.y).toBe(0);
    const north = get<ShapeElement>(resizeElements([S], ['s'], 'n', { x: 100, y: 90 }, NO), 's');
    expect(north.height).toBeCloseTo(need);
    expect(north.y + north.height).toBeCloseTo(100);
  });

  it('with Alt the top stays where the symmetric resize put it (only the height grows)', () => {
    // pointer y = 45 about the center (50) gives scale 0.1: rect y = 45, height 10 -> raised to the label height
    const out = get<ShapeElement>(resizeElements([S], ['s'], 'n', { x: 100, y: 45 }, { shift: false, alt: true }), 's');
    expect(out.height).toBeCloseTo(requiredShapeHeight(S));
    expect(out.y).toBeCloseTo(45);
  });

  it('narrowing re-wraps the label, so the minimum height grows', () => {
    const out = get<ShapeElement>(resizeElements([S], ['s'], 'e', { x: 100, y: 50 }, NO), 's');
    expect(out.width).toBe(100);
    expect(out.height).toBeGreaterThanOrEqual(requiredShapeHeight(out) - 1e-6);
  });
});

describe('resizeElements: text', () => {
  const T = mkText('t', 0, 0, 'abcdefg'); // 100.8 x 30 at 24px

  it('a corner drag scales the font size and keeps the aspect ratio', () => {
    const out = get<TextElement>(resizeElements([T], ['t'], 'se', { x: 201.6, y: 60 }, NO), 't');
    expect(out.style.fontSize).toBeCloseTo(48);
    expect(out.autoResize).toBe(true);
    expect(out.width).toBeCloseTo(201.6);
    expect(out.height).toBeCloseTo(60);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it('corner drags anchor at the opposite corner', () => {
    const out = get<TextElement>(resizeElements([T], ['t'], 'nw', { x: -100.8, y: -30 }, NO), 't');
    expect(out.style.fontSize).toBeCloseTo(48);
    expect(out.x).toBeCloseTo(-100.8);
    expect(out.y).toBeCloseTo(-30);
  });

  it('clamps the font size to the allowed range', () => {
    const tiny = get<TextElement>(resizeElements([T], ['t'], 'se', { x: 1, y: 1 }, NO), 't');
    expect(tiny.style.fontSize).toBe(MIN_FONT_SIZE);
    const huge = get<TextElement>(resizeElements([T], ['t'], 'se', { x: 1e6, y: 1e6 }, NO), 't');
    expect(huge.style.fontSize).toBe(MAX_FONT_SIZE);
  });

  it('the east and west handles set a fixed wrapping width', () => {
    const e = get<TextElement>(resizeElements([T], ['t'], 'e', { x: 150, y: 10 }, NO), 't');
    expect(e.autoResize).toBe(false);
    expect(e.width).toBe(150);
    expect(e.x).toBe(0);
    expect(e.style.fontSize).toBe(24);
    expect(e.height).toBeCloseTo(30); // fits on one line
    const narrow = get<TextElement>(resizeElements([T], ['t'], 'e', { x: 60, y: 10 }, NO), 't');
    expect(narrow.width).toBe(60);
    expect(narrow.height).toBeGreaterThan(30); // wrapped
    const w = get<TextElement>(resizeElements([T], ['t'], 'w', { x: -50, y: 10 }, NO), 't');
    expect(w.width).toBeCloseTo(150.8);
    expect(w.x).toBeCloseTo(-50);
  });

  it('e/w dragging has a minimum width of one font size, may flip, and Alt works from the center', () => {
    const min = get<TextElement>(resizeElements([T], ['t'], 'e', { x: 5, y: 0 }, NO), 't');
    expect(min.width).toBe(24);
    const flip = get<TextElement>(resizeElements([T], ['t'], 'e', { x: -50, y: 0 }, NO), 't');
    expect(flip.x).toBeCloseTo(-50);
    expect(flip.x + flip.width).toBeCloseTo(0);
    const alt = get<TextElement>(resizeElements([T], ['t'], 'e', { x: 150, y: 0 }, { shift: false, alt: true }), 't');
    expect(alt.width).toBeCloseTo(2 * (150 - 50.4));
    expect(alt.x).toBeCloseTo(50.4 - alt.width / 2);
  });

  it('a fixed-width text keeps wrapping when scaled from a corner', () => {
    const fixed = mkText('f', 0, 0, 'abcdefg hijklmn', { autoResize: false, width: 120, height: 60 });
    const out = get<TextElement>(resizeElements([fixed], ['f'], 'se', { x: 240, y: 120 }, NO), 'f');
    expect(out.autoResize).toBe(false);
    expect(out.style.fontSize).toBeCloseTo(48);
    expect(out.width).toBeCloseTo(240);
  });
});

describe('resizeElements: multi-selection', () => {
  it('scales positions and sizes about the opposite corner and maps free arrow endpoints', () => {
    const A = mkShape('A', 0, 0, 100, 100);
    const B = mkShape('B', 200, 0, 100, 100);
    const free = mkArrow('f', { x: 100, y: 50 }, { x: 200, y: 50 });
    const out = resizeElements([A, B, free], ['A', 'B', 'f'], 'se', { x: 600, y: 200 }, NO);
    expect(rect(get(out, 'A'))).toEqual({ x: 0, y: 0, width: 200, height: 200 });
    expect(rect(get(out, 'B'))).toEqual({ x: 400, y: 0, width: 200, height: 200 });
    const f = get<ArrowElement>(out, 'f');
    expect(f.start).toEqual({ x: 200, y: 100 });
    expect(f.end).toEqual({ x: 400, y: 100 });
  });

  it('re-resolves bound arrow ends after scaling', () => {
    const A = mkShape('A', 0, 0, 100, 100);
    const B = mkShape('B', 200, 0, 100, 100);
    const ar = mkArrow('ar', { x: 106, y: 50 }, { x: 194, y: 50 }, bind('A'), bind('B'));
    const out = resizeElements([A, B, ar], ['A', 'B', 'ar'], 'se', { x: 600, y: 200 }, NO);
    const r = get<ArrowElement>(out, 'ar');
    expectPoint(r.start, 206, 100);
    expectPoint(r.end, 394, 100);
    expect(r.startBinding).toEqual(bind('A'));
  });

  it('fonts scale by the geometric mean of the axis scales for a group', () => {
    const A = mkShape('A', 0, 0, 100, 100);
    const T = mkText('T', 0, 100, 'abcdefg');
    const out = resizeElements([A, T], ['A', 'T'], 'se', { x: 200, y: 260 }, NO);
    // box: 0,0,100.8x130 -> sx ~ 1.984, sy = 2 -> font about 24 * sqrt(sx * sy)
    const f = get<TextElement>(out, 'T').style.fontSize;
    expect(f).toBeGreaterThan(44);
    expect(f).toBeLessThan(50);
  });

  it('side handles on a group stretch one axis only and leave text size alone', () => {
    const A = mkShape('A', 0, 0, 100, 100);
    const T = mkText('T', 0, 200, 'abcdefg');
    const out = resizeElements([A, T], ['A', 'T'], 'e', { x: 201.6, y: 0 }, NO);
    expect(get<TextElement>(out, 'T').style.fontSize).toBe(24);
    expect(rect(get(out, 'A'))).toMatchObject({ y: 0, height: 100 });
    expect(rect(get(out, 'A')).width).toBeCloseTo(200);
  });

  it('resizing a shape re-routes arrows that stay bound to it', () => {
    const { els } = abScene();
    const out = resizeElements(els, ['B'], 'e', { x: 1060, y: 350 }, NO); // B grows to the right: center moves right
    const ar = get<ArrowElement>(out, 'ar');
    expect(ar.endBinding).toEqual(bind('B'));
    expectPoint(ar.end, 794, 350, 2); // west edge unchanged
    const down = resizeElements(els, ['B'], 's', { x: 880, y: 500 }, NO); // center moves down to y = 400
    const ar2 = get<ArrowElement>(down, 'ar');
    expect(ar2.end.y).toBeGreaterThan(350);
  });
});

describe('shapeRectFromDrag', () => {
  const o = { x: 100, y: 100 };
  it('is the normalized rect between the points', () => {
    expect(shapeRectFromDrag(o, { x: 160, y: 130 }, NO)).toEqual({ x: 100, y: 100, width: 60, height: 30 });
    expect(shapeRectFromDrag(o, { x: 40, y: 60 }, NO)).toEqual({ x: 40, y: 60, width: 60, height: 40 });
  });
  it('Shift makes it square in the direction of the drag', () => {
    expect(shapeRectFromDrag(o, { x: 160, y: 130 }, { shift: true, alt: false })).toEqual({ x: 100, y: 100, width: 60, height: 60 });
    expect(shapeRectFromDrag(o, { x: 130, y: 40 }, { shift: true, alt: false })).toEqual({ x: 100, y: 40, width: 60, height: 60 });
  });
  it('Alt grows from the center; with Shift it is a centered square', () => {
    expect(shapeRectFromDrag(o, { x: 160, y: 130 }, { shift: false, alt: true })).toEqual({ x: 40, y: 70, width: 120, height: 60 });
    expect(shapeRectFromDrag(o, { x: 160, y: 130 }, { shift: true, alt: true })).toEqual({ x: 40, y: 40, width: 120, height: 120 });
  });
  it('a zero-size drag gives a zero rect', () => {
    expect(shapeRectFromDrag(o, o, NO)).toEqual({ x: 100, y: 100, width: 0, height: 0 });
  });
});

describe('duplicateElements / cloneWithNewIds', () => {
  const off = { x: 16, y: 16 };

  it('duplicating a connected set remaps bindings to the copies', () => {
    const { els } = abScene();
    const { elements, newIds } = duplicateElements(els, ['A', 'B', 'ar'], off);
    expect(elements.length).toBe(6);
    expect(newIds.length).toBe(3);
    expect(elements.slice(0, 3)).toEqual(els);
    const [cA, cB, cAr] = elements.slice(3) as [ShapeElement, ShapeElement, ArrowElement];
    expect(newIds).toEqual([cA.id, cB.id, cAr.id]);
    expect(new Set([...els.map((e) => e.id), ...newIds]).size).toBe(6);
    expect(rect(cA)).toMatchObject({ x: 316, y: 316 });
    expect(cAr.startBinding).toEqual(bind(cA.id));
    expect(cAr.endBinding).toEqual(bind(cB.id));
    expectPoint(cAr.start, 482, 366);
    expectPoint(cAr.end, 810, 366);
    expect(cA.seed).not.toBe(1);
    expect(isValidSeed(cA.seed)).toBe(true);
  });

  it('bindings to elements outside the copied set are dropped and the endpoint stays', () => {
    const { els } = abScene();
    const { elements, newIds } = duplicateElements(els, ['A', 'ar'], off);
    const cA = elements[3] as ShapeElement;
    const cAr = elements[4] as ArrowElement;
    expect(newIds).toEqual([cA.id, cAr.id]);
    expect(cAr.startBinding).toEqual(bind(cA.id));
    expect(cAr.endBinding).toBeNull();
    expect(cAr.end).toEqual({ x: 810, y: 366 });
  });

  it('duplicating only an arrow gives an unbound, offset copy with its endpoints kept', () => {
    const { els } = abScene();
    const { elements, newIds } = duplicateElements(els, ['ar'], off);
    const c = get<ArrowElement>(elements, newIds[0]!);
    expect(c.startBinding).toBeNull();
    expect(c.endBinding).toBeNull();
    expect(c.start).toEqual({ x: 482, y: 366 });
    expect(c.end).toEqual({ x: 810, y: 366 });
    expect(c.id).not.toBe('ar');
    // the original is untouched
    expect(get<ArrowElement>(elements, 'ar')).toBe(els[2]);
  });

  it('copies are appended in z-order of the originals, regardless of the ids order', () => {
    const a = mkShape('a', 0, 0, 10, 10);
    const b = mkShape('b', 20, 0, 10, 10);
    const c = mkShape('c', 40, 0, 10, 10);
    const { elements, newIds } = duplicateElements([a, b, c], ['c', 'a'], { x: 0, y: 0 });
    expect(elements.length).toBe(5);
    expect(rect(get(elements, newIds[0]!)).x).toBe(0);
    expect(rect(get(elements, newIds[1]!)).x).toBe(40);
  });

  it('an empty or unknown selection returns the input array and no ids', () => {
    const { els } = abScene();
    expect(duplicateElements(els, [], off)).toEqual({ elements: els, newIds: [] });
    expect(duplicateElements(els, ['zzz'], off).elements).toBe(els);
  });

  it('cloneWithNewIds does not touch the inputs and keeps text sizes', () => {
    const t = mkText('t', 5, 5, 'hello', { label: undefined } as Partial<TextElement>);
    const [c] = cloneWithNewIds([t], { x: 10, y: 20 }) as [TextElement];
    expect(c.id).not.toBe('t');
    expect(c.x).toBe(15);
    expect(c.y).toBe(25);
    expect(c.width).toBe(t.width);
    expect(c.style).toEqual(t.style);
    expect(c.style).not.toBe(t.style);
    expect(t.x).toBe(5);
  });

  it('cloneWithNewIds with dangling bindings drops them', () => {
    const ar = mkArrow('ar', { x: 0, y: 0 }, { x: 10, y: 10 }, bind('ghost'), bind('ghost2'));
    const [c] = cloneWithNewIds([ar], { x: 1, y: 1 }) as [ArrowElement];
    expect(c.startBinding).toBeNull();
    expect(c.endBinding).toBeNull();
    expect(c.start).toEqual({ x: 1, y: 1 });
  });
});

describe('reorderElements', () => {
  const mk = (id: string): ShapeElement => mkShape(id, 0, 0, 10, 10);
  const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map(mk) as [ShapeElement, ShapeElement, ShapeElement, ShapeElement, ShapeElement];
  const els: ChalkElement[] = [a, b, c, d, e];
  const order = (x: readonly ChalkElement[]): string => x.map((el) => el.id).join('');

  it('front moves the selection to the end, keeping relative order', () => {
    expect(order(reorderElements(els, ['b'], 'front'))).toBe('acdeb');
    expect(order(reorderElements(els, ['d', 'b'], 'front'))).toBe('aceb' + 'd');
  });

  it('back moves the selection to the start', () => {
    expect(order(reorderElements(els, ['d'], 'back'))).toBe('dabce');
    expect(order(reorderElements(els, ['d', 'b'], 'back'))).toBe('bdace');
  });

  it('forward swaps with the next unselected element above', () => {
    expect(order(reorderElements(els, ['b'], 'forward'))).toBe('acbde');
    expect(order(reorderElements(els, ['b', 'd'], 'forward'))).toBe('acbed');
    expect(order(reorderElements(els, ['b', 'c'], 'forward'))).toBe('adbce');
  });

  it('backward is the mirror of forward', () => {
    expect(order(reorderElements(els, ['d'], 'backward'))).toBe('abdce');
    expect(order(reorderElements(els, ['b', 'd'], 'backward'))).toBe('badce');
    expect(order(reorderElements(els, ['c', 'd'], 'backward'))).toBe('acdbe');
  });

  it('returns the input array when nothing changes', () => {
    expect(reorderElements(els, ['e'], 'front')).toBe(els);
    expect(reorderElements(els, ['e'], 'forward')).toBe(els);
    expect(reorderElements(els, ['a'], 'back')).toBe(els);
    expect(reorderElements(els, ['a'], 'backward')).toBe(els);
    expect(reorderElements(els, [], 'front')).toBe(els);
    expect(reorderElements(els, ['nope'], 'back')).toBe(els);
    expect(reorderElements(els, ['d', 'e'], 'forward')).toBe(els);
    expect(reorderElements(els, ['d', 'e'], 'front')).toBe(els);
  });

  it('does not mutate its input and keeps element identity', () => {
    const out = reorderElements(els, ['b'], 'front');
    expect(order(els)).toBe('abcde');
    expect(out[4]).toBe(b);
  });
});

describe('applyStyleToElements', () => {
  it('applies the patch to the selection only and keeps other objects', () => {
    const a = mkShape('a', 0, 0, 10, 10);
    const b = mkShape('b', 20, 0, 10, 10);
    const out = applyStyleToElements([a, b], ['a'], { strokeColor: '#e03131', opacity: 50 });
    expect((out[0] as ShapeElement).style.strokeColor).toBe('#e03131');
    expect((out[0] as ShapeElement).style.opacity).toBe(50);
    expect(out[1]).toBe(b);
    expect(a.style.strokeColor).toBe(DEFAULT_STYLE.strokeColor);
  });

  it('returns the input array when nothing changes', () => {
    const a = mkShape('a', 0, 0, 10, 10);
    const els = [a];
    expect(applyStyleToElements(els, ['a'], { strokeWidth: DEFAULT_STYLE.strokeWidth })).toBe(els);
    expect(applyStyleToElements(els, [], { strokeWidth: 4 })).toBe(els);
    expect(applyStyleToElements(els, ['nope'], { strokeWidth: 4 })).toBe(els);
    expect(applyStyleToElements(els, ['a'], {})).toBe(els);
    expect(applyStyleToElements(els, ['a'], { strokeWidth: undefined })).toBe(els);
  });

  it('a strokeWidth change re-routes bound arrows (gap = 5 + width / 2)', () => {
    const { els } = abScene();
    const out = applyStyleToElements(els, ['A'], { strokeWidth: 4 });
    const ar = get<ArrowElement>(out, 'ar');
    expectPoint(ar.start, 467, 350);
    expectPoint(ar.end, 794, 350);
  });

  it('a fontSize change re-measures text and re-routes arrows bound to it', () => {
    const t = mkText('t', 100, 100, 'abcd'); // 57.6 x 30
    const x = mkShape('x', 500, 85, 100, 60);
    const ar = mkArrow('ar', { x: 0, y: 0 }, { x: 1, y: 1 }, bind('t'), bind('x'));
    const out = applyStyleToElements([t, x, ar], ['t'], { fontSize: 48 });
    const nt = get<TextElement>(out, 't');
    expect(nt.style.fontSize).toBe(48);
    expect(nt.width).toBeCloseTo(4 * 0.6 * 48);
    expect(nt.height).toBeCloseTo(60);
    const nar = get<ArrowElement>(out, 'ar');
    expect(nar.start.x).toBeCloseTo(100 + nt.width + 6, 1);
  });

  it('a fontSize change grows labelled shapes to fit', () => {
    const s = mkShape('s', 0, 0, 200, 40, { label: 'hello' });
    const out = applyStyleToElements([s], ['s'], { fontSize: 48 });
    const ns = get<ShapeElement>(out, 's');
    expect(ns.height).toBeGreaterThanOrEqual(requiredShapeHeight(ns) - 1e-6);
    expect(ns.height).toBeGreaterThan(40);
    expect(ns.y).toBe(0);
  });

  it('a style patch applies to arrows too (arrowheads)', () => {
    const ar = mkArrow('ar', { x: 0, y: 0 }, { x: 10, y: 10 });
    const out = applyStyleToElements([ar], ['ar'], { endArrowhead: 'triangle', startArrowhead: 'arrow' });
    const n = get<ArrowElement>(out, 'ar');
    expect(n.style.endArrowhead).toBe('triangle');
    expect(n.style.startArrowhead).toBe('arrow');
  });
});

describe('setElementText', () => {
  it('free text grows with its content', () => {
    const t = mkText('t', 0, 0, 'ab');
    const out = setElementText([t], 't', 'abcd\nef');
    const n = get<TextElement>(out, 't');
    expect(n.text).toBe('abcd\nef');
    expect(n.width).toBeCloseTo(4 * 14.4);
    expect(n.height).toBeCloseTo(60);
  });

  it('a fixed-width text wraps within its width', () => {
    const t = mkText('t', 0, 0, 'ab', { autoResize: false, width: 100, height: 30 });
    const n = get<TextElement>(setElementText([t], 't', 'abcdef ghijkl'), 't');
    expect(n.width).toBe(100);
    expect(n.height).toBeGreaterThan(30);
  });

  it('a shape grows taller to fit its label and bound arrows re-route to the new center', () => {
    const { els } = abScene();
    const out = setElementText(els, 'A', 'a\nb\nc\nd');
    const A = get<ShapeElement>(out, 'A');
    expect(A.label).toBe('a\nb\nc\nd');
    expect(A.height).toBeCloseTo(136); // 4 lines * 30 + 16 padding
    expect(A.y).toBe(300); // top stays fixed
    const ar = get<ArrowElement>(out, 'ar');
    expect(ar.start.x).toBeCloseTo(466, 0);
    expect(ar.start.y).toBeCloseTo(364.9, 0);
    expect(ar.startBinding?.elementId).toBe('A');
  });

  it('a shape does not shrink when the label gets shorter', () => {
    const s = mkShape('s', 0, 0, 200, 100, { label: 'a\nb\nc\nd\ne\nf' });
    const grown = get<ShapeElement>(setElementText([s], 's', 'a\nb\nc\nd\ne\nf\ng\nh'), 's');
    expect(grown.height).toBeGreaterThan(100);
    const shorter = get<ShapeElement>(setElementText([grown], 's', 'a'), 's');
    expect(shorter.height).toBe(grown.height);
  });

  it('arrow labels are set without moving the arrow', () => {
    const { els } = abScene();
    const out = setElementText(els, 'ar', 'goes to');
    const ar = get<ArrowElement>(out, 'ar');
    expect(ar.label).toBe('goes to');
    expect(ar.start).toEqual({ x: 466, y: 350 });
  });

  it('returns the input array when the text is unchanged or the id is missing', () => {
    const t = mkText('t', 0, 0, 'same');
    const els = [t];
    expect(setElementText(els, 't', 'same')).toBe(els);
    expect(setElementText(els, 'nope', 'x')).toBe(els);
    const s = mkShape('s', 0, 0, 10, 10);
    expect(setElementText([s], 's', '')).toEqual([s]);
  });
});

describe('fitShapeToLabel', () => {
  it('returns the same object when the label fits, and grows downwards otherwise', () => {
    const fits = mkShape('s', 0, 0, 200, 100, { label: 'hi' });
    expect(fitShapeToLabel(fits)).toBe(fits);
    const none = mkShape('n', 0, 0, 200, 4);
    expect(fitShapeToLabel(none)).toBe(none);
    const tight = mkShape('t', 10, 20, 200, 20, { label: 'one\ntwo\nthree' });
    const out = fitShapeToLabel(tight);
    expect(out).not.toBe(tight);
    expect(out.y).toBe(20);
    expect(out.height).toBeCloseTo(106); // 90 + 16
  });

  it('works for every shape kind', () => {
    for (const kind of ['rectangle', 'diamond', 'ellipse', 'triangle'] as ShapeKind[]) {
      const s = mkShape('s', 0, 0, 120, 20, { label: 'some label text here' }, {}, kind);
      const out = fitShapeToLabel(s);
      expect(out.height).toBeGreaterThan(20);
      expect(fitShapeToLabel(out)).toBe(out);
    }
  });
});

describe('setArrowEndpoint', () => {
  const A = mkShape('A', 300, 300, 160, 100);
  const B = mkShape('B', 800, 300, 160, 100);

  it('reproduces the tool geometry: arrow dragged from (380,350) to (880,350) between A and B', () => {
    const created = { ...createArrow({ x: 380, y: 350 }, { x: 880, y: 350 }, DEFAULT_STYLE), id: 'new', startBinding: bind('A') };
    const els = addElements([A, B], [created]);
    const out = setArrowEndpoint(els, 'new', 'end', { x: 880, y: 350 }, { elementId: 'B', fixedPoint: [0.5, 0.5] });
    const ar = get<ArrowElement>(out, 'new');
    expect(ar.startBinding).toEqual(bind('A'));
    expect(ar.endBinding).toEqual(bind('B'));
    expectPoint(ar.start, 466, 350);
    expectPoint(ar.end, 794, 350);
  });

  it('a free end sits exactly at the point while a bound start slides to face it', () => {
    const ar0 = mkArrow('ar', { x: 380, y: 350 }, { x: 500, y: 350 }, bind('A'), null);
    const out = setArrowEndpoint([A, B, ar0], 'ar', 'end', { x: 380, y: 700 }, null);
    const ar = get<ArrowElement>(out, 'ar');
    expect(ar.end).toEqual({ x: 380, y: 700 });
    expectPoint(ar.start, 380, 406);
  });

  it('can unbind an end (binding null) and leaves the end free at the point', () => {
    const { els } = abScene();
    const out = setArrowEndpoint(els, 'ar', 'end', { x: 700, y: 500 }, null);
    const ar = get<ArrowElement>(out, 'ar');
    expect(ar.endBinding).toBeNull();
    expect(ar.end).toEqual({ x: 700, y: 500 });
    expect(ar.startBinding).toEqual(bind('A'));
  });

  it('rejects bindings to itself, to missing or non-bindable elements, and to the other end target', () => {
    const other = mkArrow('other', { x: 0, y: 0 }, { x: 10, y: 10 });
    const ar0 = mkArrow('ar', { x: 466, y: 350 }, { x: 600, y: 350 }, bind('A'), null);
    const els: ChalkElement[] = [A, B, other, ar0];
    const p = { x: 600, y: 350 };
    expect(get<ArrowElement>(setArrowEndpoint(els, 'ar', 'end', p, bind('ar')), 'ar').endBinding).toBeNull();
    expect(get<ArrowElement>(setArrowEndpoint(els, 'ar', 'end', p, bind('ghost')), 'ar').endBinding).toBeNull();
    expect(get<ArrowElement>(setArrowEndpoint(els, 'ar', 'end', p, bind('other')), 'ar').endBinding).toBeNull();
    const sameAsStart = get<ArrowElement>(setArrowEndpoint(els, 'ar', 'end', p, bind('A')), 'ar');
    expect(sameAsStart.endBinding).toBeNull();
    expect(sameAsStart.end).toEqual(p);
    const fromStart = get<ArrowElement>(setArrowEndpoint([A, mkArrow('x', { x: 0, y: 0 }, { x: 9, y: 9 }, null, bind('A'))], 'x', 'start', { x: 1, y: 1 }, bind('A')), 'x');
    expect(fromStart.startBinding).toBeNull();
  });

  it('clamps the fixed point ratios and copies the binding', () => {
    const ar0 = mkArrow('ar', { x: 0, y: 0 }, { x: 10, y: 10 });
    const input: Binding = { elementId: 'B', fixedPoint: [3, -1] };
    const ar = get<ArrowElement>(setArrowEndpoint([A, B, ar0], 'ar', 'end', { x: 880, y: 300 }, input), 'ar');
    expect(ar.endBinding).toEqual({ elementId: 'B', fixedPoint: [1, 0] });
    expect(ar.endBinding).not.toBe(input);
  });

  it('returns the input array for a missing id or a non-arrow', () => {
    const els: ChalkElement[] = [A, B];
    expect(setArrowEndpoint(els, 'nope', 'end', { x: 0, y: 0 }, null)).toBe(els);
    expect(setArrowEndpoint(els, 'A', 'end', { x: 0, y: 0 }, null)).toBe(els);
  });

  it('works for the start end too', () => {
    const ar0 = mkArrow('ar', { x: 0, y: 0 }, { x: 880, y: 350 }, null, bind('B'));
    const out = setArrowEndpoint([A, B, ar0], 'ar', 'start', { x: 380, y: 350 }, bind('A'));
    const ar = get<ArrowElement>(out, 'ar');
    expect(ar.startBinding).toEqual(bind('A'));
    expectPoint(ar.start, 466, 350);
    expectPoint(ar.end, 794, 350);
  });
});

describe('immutability', () => {
  function deepFreeze<T>(v: T): T {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) {
      Object.freeze(v);
      for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
    }
    return v;
  }

  it('no operation mutates frozen input', () => {
    const { els } = abScene();
    const label = mkShape('L', 0, 0, 200, 40, { label: 'a b c d e f g h i j k l m n o p' });
    const text = mkText('T', 0, 500, 'abcdefg');
    const all = deepFreeze([...els, label, text]) as ChalkElement[];
    const ids = all.map((e) => e.id);
    const handles: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    expect(() => {
      moveElements(all, ids, 3, 4);
      moveElements(all, ['A'], 3, 4);
      for (const h of handles) {
        resizeElements(all, ids, h, { x: 123, y: 456 }, { shift: true, alt: false });
        resizeElements(all, ['T'], h, { x: -20, y: 456 }, NO);
        resizeElements(all, ['L'], h, { x: 20, y: 6 }, { shift: false, alt: true });
      }
      removeElements(all, ['A']);
      duplicateElements(all, ids, { x: 1, y: 1 });
      reorderElements(all, ['A', 'T'], 'front');
      reorderElements(all, ['A', 'T'], 'backward');
      applyStyleToElements(all, ids, { strokeWidth: 4, fontSize: 40 });
      setElementText(all, 'L', 'x\ny\nz');
      setElementText(all, 'T', 'hello world');
      setArrowEndpoint(all, 'ar', 'end', { x: 5, y: 5 }, bind('L'));
    }).not.toThrow();
  });
});
