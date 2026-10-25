// Unit tests for core/serialize: scene file envelope and defensive restore (WP1).
import { describe, expect, it } from 'vitest';
import type { ArrowElement, ChalkElement, ShapeElement, TextElement } from '../types';
import { DEFAULT_STYLE, MAX_FONT_SIZE, MIN_FONT_SIZE, MIN_SHAPE_SIZE } from '../constants';
import { isValidSeed } from './ids';
import { updateBoundArrows } from './binding';
import { createArrow, createShape, createText, setElementText } from './scene';
import { MIGRATIONS, parseSceneFile, restoreElements, restoreStyle, SceneParseError, toSceneFile } from './serialize';

function envelope(elements: unknown, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'chalk/scene', version: 1, elements, ...over };
}
function rawShape(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'shape1', seed: 5, type: 'shape', shape: 'rectangle', x: 0, y: 0, width: 100, height: 50, label: '', style: { ...DEFAULT_STYLE }, ...over };
}
function rawArrow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'arrow1', seed: 6, type: 'arrow', start: { x: 0, y: 0 }, end: { x: 10, y: 10 }, startBinding: null, endBinding: null, label: '',
    style: { ...DEFAULT_STYLE }, ...over,
  };
}
function rawText(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'text1', seed: 7, type: 'text', x: 5, y: 6, width: 10, height: 10, text: 'hello', autoResize: true, style: { ...DEFAULT_STYLE }, ...over };
}
const first = <T extends ChalkElement>(els: ChalkElement[]): T => els[0] as T;

describe('SceneParseError / MIGRATIONS', () => {
  it('is an Error with its own name', () => {
    const e = new SceneParseError('boom');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(SceneParseError);
    expect(e.name).toBe('SceneParseError');
    expect(e.message).toBe('boom');
  });
  it('MIGRATIONS is empty in v1', () => {
    expect(MIGRATIONS).toEqual({});
  });
});

describe('toSceneFile / parseSceneFile round trip', () => {
  function sampleScene(): ChalkElement[] {
    const a = { ...createShape('rectangle', { x: 300, y: 300, width: 160, height: 100 }, DEFAULT_STYLE), id: 'A' };
    const b = { ...createShape('ellipse', { x: 800, y: 300, width: 160, height: 100 }, { ...DEFAULT_STYLE, backgroundColor: '#a5d8ff' }), id: 'B', label: 'B box' };
    const t = createText({ x: 50, y: 60 }, 'free text', DEFAULT_STYLE);
    let arrow: ArrowElement = {
      ...createArrow({ x: 0, y: 0 }, { x: 1, y: 1 }, DEFAULT_STYLE), id: 'AR',
      startBinding: { elementId: 'A', fixedPoint: [0.5, 0.5] }, endBinding: { elementId: 'B', fixedPoint: [0.25, 0.5] },
    };
    arrow = { ...arrow, label: 'connects' };
    return [...updateBoundArrows([a, b, t, arrow], null)];
  }

  it('wraps elements in the versioned envelope without sharing the array', () => {
    const els = sampleScene();
    const f = toSceneFile(els);
    expect(f.type).toBe('chalk/scene');
    expect(f.version).toBe(1);
    expect(f.elements).toEqual(els);
    expect(f.elements).not.toBe(els);
    expect(toSceneFile([]).elements).toEqual([]);
  });

  it('survives JSON serialization unchanged', () => {
    const els = sampleScene();
    const json = JSON.parse(JSON.stringify(toSceneFile(els)));
    expect(parseSceneFile(json)).toEqual(els);
  });

  it('an empty scene round-trips', () => {
    expect(parseSceneFile(toSceneFile([]))).toEqual([]);
  });

  it('survives a text edit made through the scene functions', () => {
    const els = setElementText(sampleScene(), 'A', 'a\nb\nc\nd');
    expect(parseSceneFile(JSON.parse(JSON.stringify(toSceneFile(els))))).toEqual(els);
  });
});

describe('parseSceneFile rejects bad envelopes', () => {
  it.each([null, undefined, 5, 'x', [], true])('rejects a non-object: %j', (v) => {
    expect(() => parseSceneFile(v)).toThrow(SceneParseError);
  });
  it('rejects a wrong or missing type', () => {
    expect(() => parseSceneFile(envelope([], { type: 'excalidraw' }))).toThrow(SceneParseError);
    expect(() => parseSceneFile({ version: 1, elements: [] })).toThrow(SceneParseError);
  });
  it.each([0, -1, 1.5, '1', null, undefined, NaN])('rejects an invalid version: %j', (v) => {
    expect(() => parseSceneFile(envelope([], { version: v }))).toThrow(SceneParseError);
  });
  it('rejects a future version with a clear message', () => {
    expect(() => parseSceneFile(envelope([], { version: 2 }))).toThrow('This file was made by a newer Chalk');
    expect(() => parseSceneFile(envelope([], { version: 99 }))).toThrow(SceneParseError);
  });
  it('rejects when elements is not an array', () => {
    expect(() => parseSceneFile(envelope({}))).toThrow(SceneParseError);
    expect(() => parseSceneFile(envelope('nope'))).toThrow(SceneParseError);
    expect(() => parseSceneFile({ type: 'chalk/scene', version: 1 })).toThrow(SceneParseError);
  });
  it('accepts a plain valid file', () => {
    expect(parseSceneFile(envelope([rawShape()]))).toHaveLength(1);
  });
});

describe('restoreStyle', () => {
  it('returns defaults for non-objects and a fresh copy', () => {
    for (const v of [null, undefined, 3, 'x', []]) {
      const s = restoreStyle(v);
      expect(s).toEqual(DEFAULT_STYLE);
      expect(s).not.toBe(DEFAULT_STYLE);
    }
  });

  it('copies valid fields', () => {
    const full = {
      strokeColor: '#e03131', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 4, strokeStyle: 'dashed', roughness: 2,
      opacity: 40, edges: 'sharp', fontSize: 32, fontFamily: 'mono', textAlign: 'right', startArrowhead: 'triangle', endArrowhead: 'none',
    };
    expect(restoreStyle(full)).toEqual(full);
    expect(restoreStyle({ backgroundColor: '#ffc9c9' }).backgroundColor).toBe('#ffc9c9');
    expect(restoreStyle({ strokeWidth: 3.5 }).strokeWidth).toBe(3.5);
  });

  it('ignores invalid fields one by one', () => {
    const bad = {
      strokeColor: 5, backgroundColor: null, fillStyle: 'dots', strokeWidth: 0, strokeStyle: 'wavy', roughness: 3, opacity: 101,
      edges: 'pointy', fontSize: 'big', fontFamily: 'comic', textAlign: 'justify', startArrowhead: 'dot', endArrowhead: 1,
    };
    expect(restoreStyle(bad)).toEqual(DEFAULT_STYLE);
    expect(restoreStyle({ strokeWidth: -2 }).strokeWidth).toBe(DEFAULT_STYLE.strokeWidth);
    expect(restoreStyle({ strokeWidth: Infinity }).strokeWidth).toBe(DEFAULT_STYLE.strokeWidth);
    expect(restoreStyle({ roughness: -0.1 }).roughness).toBe(DEFAULT_STYLE.roughness);
    expect(restoreStyle({ opacity: -1 }).opacity).toBe(DEFAULT_STYLE.opacity);
    expect(restoreStyle({ roughness: NaN }).roughness).toBe(DEFAULT_STYLE.roughness);
    expect(restoreStyle({ strokeColor: '' }).strokeColor).toBe(DEFAULT_STYLE.strokeColor);
  });

  it('accepts the range edges and clamps font sizes', () => {
    expect(restoreStyle({ roughness: 0 }).roughness).toBe(0);
    expect(restoreStyle({ roughness: 2 }).roughness).toBe(2);
    expect(restoreStyle({ opacity: 0 }).opacity).toBe(0);
    expect(restoreStyle({ opacity: 100 }).opacity).toBe(100);
    expect(restoreStyle({ fontSize: 1 }).fontSize).toBe(MIN_FONT_SIZE);
    expect(restoreStyle({ fontSize: 5000 }).fontSize).toBe(MAX_FONT_SIZE);
    expect(restoreStyle({ fontSize: 20 }).fontSize).toBe(20);
    expect(restoreStyle({ fontSize: NaN }).fontSize).toBe(DEFAULT_STYLE.fontSize);
  });
});

describe('restoreElements: common rules', () => {
  it('drops non-objects and unknown types', () => {
    const out = restoreElements([null, 5, 'x', [], { type: 'blob' }, { id: 'q' }, rawShape()]);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('shape1');
  });

  it('keeps input order and returns a fresh array', () => {
    const raw = [rawShape({ id: 'a' }), rawText({ id: 'b' }), rawShape({ id: 'c' })];
    expect(restoreElements(raw).map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(restoreElements([])).toEqual([]);
  });

  it('assigns new ids when missing, empty or not a string', () => {
    const out = restoreElements([rawShape({ id: undefined }), rawShape({ id: '' }), rawShape({ id: 42 })]);
    const ids = out.map((e) => e.id);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(new Set(ids).size).toBe(3);
  });

  it('dedupes ids: the first occurrence keeps it', () => {
    const out = restoreElements([rawShape({ id: 'dup', x: 1 }), rawShape({ id: 'dup', x: 2 }), rawText({ id: 'dup' })]);
    expect(out).toHaveLength(3);
    expect(out[0]!.id).toBe('dup');
    expect(out[1]!.id).not.toBe('dup');
    expect(out[2]!.id).not.toBe('dup');
    expect(new Set(out.map((e) => e.id)).size).toBe(3);
    expect((out[0] as ShapeElement).x).toBe(1);
  });

  it('fixes seeds that are zero, fractional, out of range or missing', () => {
    for (const seed of [0, 1.5, 2 ** 31 - 1, -4, 'x', null, undefined, NaN]) {
      const el = first(restoreElements([rawShape({ seed })]));
      expect(isValidSeed(el.seed)).toBe(true);
    }
    expect(first(restoreElements([rawShape({ seed: 12345 })])).seed).toBe(12345);
    expect(first(restoreElements([rawShape({ seed: 1 })])).seed).toBe(1);
    expect(first(restoreElements([rawShape({ seed: 2 ** 31 - 2 })])).seed).toBe(2 ** 31 - 2);
  });

  it('fills style defaults and repairs bad style values', () => {
    expect(first(restoreElements([rawShape({ style: undefined })])).style).toEqual(DEFAULT_STYLE);
    expect(first(restoreElements([rawShape({ style: { opacity: 500, strokeColor: '#123456' } })])).style).toEqual({ ...DEFAULT_STYLE, strokeColor: '#123456' });
  });

  it('strips unknown fields', () => {
    const el = first(restoreElements([rawShape({ extra: 'x', isDeleted: true })])) as unknown as Record<string, unknown>;
    expect(el.extra).toBeUndefined();
    expect(el.isDeleted).toBeUndefined();
  });
});

describe('restoreElements: shapes', () => {
  it('drops shapes with non-finite geometry', () => {
    for (const k of ['x', 'y', 'width', 'height']) {
      for (const bad of [NaN, Infinity, '5', null, undefined]) {
        expect(restoreElements([rawShape({ [k]: bad })])).toEqual([]);
      }
    }
  });

  it('repairs unknown shape kinds, tiny sizes and bad labels', () => {
    expect((first(restoreElements([rawShape({ shape: 'hexagon' })])) as ShapeElement).shape).toBe('rectangle');
    expect((first(restoreElements([rawShape({ shape: 'triangle' })])) as ShapeElement).shape).toBe('triangle');
    const tiny = first<ShapeElement>(restoreElements([rawShape({ width: 0, height: -10 })]));
    expect(tiny.width).toBe(MIN_SHAPE_SIZE);
    expect(tiny.height).toBe(MIN_SHAPE_SIZE);
    expect(first<ShapeElement>(restoreElements([rawShape({ label: 7 })])).label).toBe('');
    expect(first<ShapeElement>(restoreElements([rawShape({ label: undefined })])).label).toBe('');
    expect(first<ShapeElement>(restoreElements([rawShape({ label: 'hi' })])).label).toBe('hi');
    expect(first<ShapeElement>(restoreElements([rawShape({ width: 300.5 })])).width).toBe(300.5);
  });
});

describe('restoreElements: text', () => {
  it('drops blank or non-string text', () => {
    expect(restoreElements([rawText({ text: '' }), rawText({ text: '   \n ' }), rawText({ text: 5 }), rawText({ text: undefined })])).toEqual([]);
  });

  it('drops text with non-finite x or y', () => {
    expect(restoreElements([rawText({ x: NaN }), rawText({ y: 'a' }), rawText({ x: undefined })])).toEqual([]);
  });

  it('re-measures: width and height are derived from the text', () => {
    const t = first<TextElement>(restoreElements([rawText({ text: 'abcd\nef', width: 1, height: 1 })]));
    expect(t.width).toBeCloseTo(4 * 14.4);
    expect(t.height).toBeCloseTo(60);
    expect(t.autoResize).toBe(true);
  });

  it('autoResize: defaults to true, and a fixed width needs a positive finite width', () => {
    expect(first<TextElement>(restoreElements([rawText({ autoResize: 'no' })])).autoResize).toBe(true);
    expect(first<TextElement>(restoreElements([rawText({ autoResize: undefined })])).autoResize).toBe(true);
    expect(first<TextElement>(restoreElements([rawText({ autoResize: false, width: 0 })])).autoResize).toBe(true);
    expect(first<TextElement>(restoreElements([rawText({ autoResize: false, width: NaN })])).autoResize).toBe(true);
    expect(first<TextElement>(restoreElements([rawText({ autoResize: false, width: -4 })])).autoResize).toBe(true);
    expect(first<TextElement>(restoreElements([rawText({ autoResize: false, width: undefined })])).autoResize).toBe(true);
    const fixed = first<TextElement>(restoreElements([rawText({ autoResize: false, width: 60, text: 'abcdef ghijkl' })]));
    expect(fixed.autoResize).toBe(false);
    expect(fixed.width).toBe(60);
    expect(fixed.height).toBeGreaterThan(30); // wrapped
  });
});

describe('restoreElements: arrows and bindings', () => {
  it('drops arrows with non-finite or missing endpoints', () => {
    expect(restoreElements([rawArrow({ start: { x: NaN, y: 0 } }), rawArrow({ end: null }), rawArrow({ start: 'a' }), rawArrow({ end: { x: 1 } })])).toEqual([]);
  });

  it('keeps unbound arrows as they are, with a safe label', () => {
    const a = first<ArrowElement>(restoreElements([rawArrow({ label: 4 })]));
    expect(a.start).toEqual({ x: 0, y: 0 });
    expect(a.end).toEqual({ x: 10, y: 10 });
    expect(a.label).toBe('');
    expect(first<ArrowElement>(restoreElements([rawArrow({ label: 'yes' })])).label).toBe('yes');
  });

  it('drops dangling bindings (missing target) and bindings to arrows', () => {
    const out = restoreElements([
      rawShape({ id: 'S' }),
      rawArrow({ id: 'other' }),
      rawArrow({
        id: 'x', startBinding: { elementId: 'ghost', fixedPoint: [0.5, 0.5] }, endBinding: { elementId: 'other', fixedPoint: [0.5, 0.5] },
      }),
    ]);
    const x = out.find((e) => e.id === 'x') as ArrowElement;
    expect(x.startBinding).toBeNull();
    expect(x.endBinding).toBeNull();
  });

  it('keeps valid bindings, including to elements that come later in the array, and to text', () => {
    const out = restoreElements([
      rawArrow({
        id: 'x', start: { x: 0, y: 0 }, end: { x: 1, y: 1 },
        startBinding: { elementId: 'S', fixedPoint: [0.5, 0.5] }, endBinding: { elementId: 'T', fixedPoint: [0, 1] },
      }),
      rawShape({ id: 'S', x: 100, y: 100, width: 100, height: 100 }),
      rawText({ id: 'T', x: 400, y: 100 }),
    ]);
    const x = out.find((e) => e.id === 'x') as ArrowElement;
    expect(x.startBinding).toEqual({ elementId: 'S', fixedPoint: [0.5, 0.5] });
    expect(x.endBinding).toEqual({ elementId: 'T', fixedPoint: [0, 1] });
    expect(out[0]!.id).toBe('x'); // z-order preserved
  });

  it('re-resolves bound arrows so their endpoints touch the targets', () => {
    const out = restoreElements([
      rawShape({ id: 'A', x: 300, y: 300, width: 160, height: 100 }),
      rawShape({ id: 'B', x: 800, y: 300, width: 160, height: 100 }),
      rawArrow({
        id: 'x', start: { x: 0, y: 0 }, end: { x: 1, y: 1 },
        startBinding: { elementId: 'A', fixedPoint: [0.5, 0.5] }, endBinding: { elementId: 'B', fixedPoint: [0.5, 0.5] },
      }),
    ]);
    const x = out[2] as ArrowElement;
    expect(x.start.x).toBeCloseTo(466);
    expect(x.start.y).toBeCloseTo(350);
    expect(x.end.x).toBeCloseTo(794);
    expect(x.end.y).toBeCloseTo(350);
  });

  it('clamps fixedPoint ratios to [0, 1]', () => {
    const out = restoreElements([
      rawShape({ id: 'S' }),
      rawArrow({ startBinding: { elementId: 'S', fixedPoint: [-3, 7] } }),
    ]);
    expect((out[1] as ArrowElement).startBinding).toEqual({ elementId: 'S', fixedPoint: [0, 1] });
  });

  it('drops bindings with a malformed fixedPoint or elementId', () => {
    for (const fixedPoint of [[0.5], [0.5, 0.5, 0.5], [NaN, 0], ['a', 'b'], 'xy', null, undefined]) {
      const out = restoreElements([rawShape({ id: 'S' }), rawArrow({ startBinding: { elementId: 'S', fixedPoint } })]);
      expect((out[1] as ArrowElement).startBinding).toBeNull();
    }
    const out = restoreElements([rawShape({ id: 'S' }), rawArrow({ startBinding: { elementId: 5, fixedPoint: [0, 0] }, endBinding: 'S' })]);
    expect((out[1] as ArrowElement).startBinding).toBeNull();
    expect((out[1] as ArrowElement).endBinding).toBeNull();
  });

  it('both ends bound to the same element: the end binding is dropped', () => {
    const out = restoreElements([
      rawShape({ id: 'S', x: 100, y: 100, width: 100, height: 100 }),
      rawArrow({
        start: { x: 120, y: 120 }, end: { x: 180, y: 180 },
        startBinding: { elementId: 'S', fixedPoint: [0.2, 0.2] }, endBinding: { elementId: 'S', fixedPoint: [0.8, 0.8] },
      }),
    ]);
    const a = out[1] as ArrowElement;
    expect(a.startBinding).toEqual({ elementId: 'S', fixedPoint: [0.2, 0.2] });
    expect(a.endBinding).toBeNull();
  });

  it('a binding to a duplicated id points at the first occurrence', () => {
    const out = restoreElements([
      rawShape({ id: 'dup', x: 0, y: 0, width: 100, height: 100 }),
      rawShape({ id: 'dup', x: 1000, y: 1000, width: 100, height: 100 }),
      rawArrow({ start: { x: 500, y: 50 }, end: { x: 600, y: 50 }, startBinding: { elementId: 'dup', fixedPoint: [0.5, 0.5] } }),
    ]);
    const a = out[2] as ArrowElement;
    expect(a.startBinding?.elementId).toBe('dup');
    expect(out[0]!.id).toBe('dup');
    expect(out[1]!.id).not.toBe('dup');
    // resolved against the first (at the origin), not the second
    expect(a.start.x).toBeLessThan(200);
    expect(a.start.y).toBeLessThan(200);
  });

  it('an arrow whose own id is used in a binding does not bind to itself', () => {
    const out = restoreElements([rawArrow({ id: 'me', startBinding: { elementId: 'me', fixedPoint: [0.5, 0.5] } })]);
    expect((out[0] as ArrowElement).startBinding).toBeNull();
  });

  it('drops the binding when the target element itself was dropped', () => {
    const out = restoreElements([
      rawShape({ id: 'bad', width: NaN }),
      rawText({ id: 'blank', text: ' ' }),
      rawArrow({ startBinding: { elementId: 'bad', fixedPoint: [0.5, 0.5] }, endBinding: { elementId: 'blank', fixedPoint: [0.5, 0.5] } }),
    ]);
    expect(out).toHaveLength(1);
    expect((out[0] as ArrowElement).startBinding).toBeNull();
    expect((out[0] as ArrowElement).endBinding).toBeNull();
  });
});

describe('parseSceneFile end to end', () => {
  it('restores a messy file', () => {
    const file = envelope([
      rawShape({ id: 'S', seed: 0, style: { strokeColor: 1, opacity: 50 } }),
      { type: 'nonsense' },
      rawText({ text: '' }),
      rawText({ id: 'T', text: 'kept' }),
      rawArrow({ id: 'A', endBinding: { elementId: 'S', fixedPoint: [9, 9] } }),
    ]);
    const out = parseSceneFile(file);
    expect(out.map((e) => e.id)).toEqual(['S', 'T', 'A']);
    expect(isValidSeed(out[0]!.seed)).toBe(true);
    expect(out[0]!.style.opacity).toBe(50);
    expect(out[0]!.style.strokeColor).toBe(DEFAULT_STYLE.strokeColor);
    expect((out[2] as ArrowElement).endBinding).toEqual({ elementId: 'S', fixedPoint: [1, 1] });
  });

  it('does not mutate its input', () => {
    const file = envelope([rawShape({ seed: 0 }), rawArrow({ endBinding: { elementId: 'shape1', fixedPoint: [9, 9] } })]);
    const snapshot = JSON.stringify(file);
    parseSceneFile(file);
    expect(JSON.stringify(file)).toBe(snapshot);
  });
});
