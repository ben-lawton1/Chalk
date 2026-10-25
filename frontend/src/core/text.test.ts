// Unit tests for core/text using the deterministic approx measurer (WP0).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ArrowElement, ShapeElement, ShapeKind, TextElement } from '../types';
import { ARROW_LABEL_MAX_WIDTH, DEFAULT_STYLE, LINE_HEIGHT, MIN_SHAPE_SIZE } from '../constants';
import { SHAPES, SHAPE_KINDS } from './shapes';
import {
  approxMeasure, fontString, layoutForEditing, layoutText, lineHeightPx, measureLine, requiredShapeHeight, setMeasurer,
  withMeasuredText, wrapText,
} from './text';

const FS = 20;
const FONT = fontString(FS, 'sans');
const CW = FS * 0.6; // approx char width at FS

beforeEach(() => setMeasurer(approxMeasure));
afterEach(() => setMeasurer(null));

function textEl(over: Partial<TextElement> = {}): TextElement {
  return {
    id: 't', seed: 1, style: { ...DEFAULT_STYLE, fontSize: FS, fontFamily: 'sans' }, type: 'text',
    x: 10, y: 20, width: 0, height: 0, text: 'hello', autoResize: true, ...over,
  };
}
function shapeEl(kind: ShapeKind, over: Partial<ShapeElement> = {}): ShapeElement {
  return {
    id: 's', seed: 1, style: { ...DEFAULT_STYLE, fontSize: FS, fontFamily: 'sans' }, type: 'shape', shape: kind,
    x: 0, y: 0, width: 200, height: 100, label: '', ...over,
  };
}
function arrowEl(over: Partial<ArrowElement> = {}): ArrowElement {
  return {
    id: 'a', seed: 1, style: { ...DEFAULT_STYLE, fontSize: FS, fontFamily: 'sans' }, type: 'arrow',
    start: { x: 0, y: 0 }, end: { x: 100, y: 40 }, startBinding: null, endBinding: null, label: '', ...over,
  };
}

describe('basics', () => {
  it('fontString and lineHeightPx', () => {
    expect(fontString(20, 'mono')).toContain('20px ');
    expect(lineHeightPx(20)).toBe(20 * LINE_HEIGHT);
  });
  it('measureLine uses the swapped measurer and caches', () => {
    let calls = 0;
    setMeasurer((t) => { calls++; return t.length; });
    expect(measureLine('abcd', FONT)).toBe(4);
    expect(measureLine('abcd', FONT)).toBe(4);
    expect(calls).toBe(1);
    setMeasurer(null);
    setMeasurer(approxMeasure);
    expect(measureLine('ab', FONT)).toBeCloseTo(2 * CW, 9);
  });
  it('the default measurer falls back to approx in node', () => {
    setMeasurer(null);
    expect(measureLine('abc', FONT)).toBeCloseTo(3 * CW, 9);
  });
});

describe('wrapText', () => {
  it('wraps at word boundaries', () => {
    // each word is 5 chars = 60px; two words with a space = 11 chars = 132px
    expect(wrapText('hello world foo', FONT, 11 * CW + 1)).toEqual(['hello world', 'foo']);
    expect(wrapText('hello world foo', FONT, 7 * CW)).toEqual(['hello', 'world', 'foo']);
  });
  it('breaks over-long words by character', () => {
    expect(wrapText('abcdefgh', FONT, 3 * CW + 1)).toEqual(['abc', 'def', 'gh']);
    expect(wrapText('xx abcdefgh', FONT, 3 * CW + 1)).toEqual(['xx', 'abc', 'def', 'gh']);
  });
  it('keeps explicit newlines and empty lines', () => {
    expect(wrapText('a\n\nb', FONT, 100 * CW)).toEqual(['a', '', 'b']);
    expect(wrapText('', FONT, 100)).toEqual(['']);
  });
  it('null width only breaks at newlines', () => {
    expect(wrapText('a very long line indeed\nsecond', FONT, null)).toEqual(['a very long line indeed', 'second']);
  });
  it('preserves multiple spaces', () => {
    expect(wrapText('a  b', FONT, 100 * CW)).toEqual(['a  b']);
  });
  it('never returns an empty array', () => {
    expect(wrapText('', FONT, null)).toEqual(['']);
  });
});

describe('layoutText: text', () => {
  it('auto-resize text is sized from its widest line', () => {
    const l = layoutText(textEl({ text: 'ab\nabcd' }))!;
    expect(l.lines).toEqual(['ab', 'abcd']);
    expect(l.width).toBeCloseTo(4 * CW, 9);
    expect(l.height).toBeCloseTo(2 * lineHeightPx(FS), 9);
    expect(l.x).toBe(10);
    expect(l.y).toBe(20);
    expect(l.wrap).toBe(false);
    expect(l.align).toBe('left');
  });
  it('empty auto-resize text has a minimum width of half the font size', () => {
    expect(layoutText(textEl({ text: '' }))!.width).toBe(FS * 0.5);
  });
  it('fixed-width text wraps and keeps its width', () => {
    const l = layoutText(textEl({ text: 'hello world', autoResize: false, width: 6 * CW }))!;
    expect(l.lines).toEqual(['hello', 'world']);
    expect(l.width).toBe(6 * CW);
    expect(l.wrap).toBe(true);
    expect(l.height).toBeCloseTo(2 * lineHeightPx(FS), 9);
  });
});

describe('layoutText: labels', () => {
  it('returns null for empty shape and arrow labels', () => {
    expect(layoutText(shapeEl('rectangle'))).toBeNull();
    expect(layoutText(arrowEl())).toBeNull();
  });
  it('centers a shape label vertically in its label box', () => {
    const s = shapeEl('rectangle', { label: 'Hi' });
    const l = layoutText(s)!;
    const box = SHAPES.rectangle.labelBox({ x: 0, y: 0, width: 200, height: 100 });
    expect(l.x).toBe(box.x);
    expect(l.width).toBe(box.width);
    expect(l.align).toBe('center');
    expect(l.y + l.height / 2).toBeCloseTo(box.y + box.height / 2, 9);
  });
  it('places an arrow label centered at the midpoint', () => {
    const l = layoutText(arrowEl({ label: 'abcd' }))!;
    expect(l.width).toBeCloseTo(4 * CW, 9);
    expect(l.x + l.width / 2).toBeCloseTo(50, 9);
    expect(l.y + l.height / 2).toBeCloseTo(20, 9);
  });
  it('wraps long arrow labels at ARROW_LABEL_MAX_WIDTH', () => {
    const l = layoutText(arrowEl({ label: 'word '.repeat(40).trim() }))!;
    expect(l.lines.length).toBeGreaterThan(1);
    expect(l.width).toBeLessThanOrEqual(ARROW_LABEL_MAX_WIDTH);
  });
  it('layoutForEditing lays an empty label out as one line', () => {
    const l = layoutForEditing(shapeEl('ellipse'));
    expect(l.lines.length).toBe(1);
    expect(l.height).toBeCloseTo(lineHeightPx(FS), 9);
    expect(layoutForEditing(arrowEl()).lines.length).toBe(1);
    expect(layoutForEditing(textEl({ text: 'x' })).lines).toEqual(['x']);
  });
});

describe('withMeasuredText', () => {
  it('derives width and height', () => {
    const t = withMeasuredText(textEl({ text: 'abcd' }));
    expect(t.width).toBeCloseTo(4 * CW, 9);
    expect(t.height).toBeCloseTo(lineHeightPx(FS), 9);
  });
  it('returns the same object when nothing changed', () => {
    const t = withMeasuredText(textEl({ text: 'abcd' }));
    expect(withMeasuredText(t)).toBe(t);
  });
  it('derives only the height for fixed-width text', () => {
    const t = withMeasuredText(textEl({ text: 'hello world', autoResize: false, width: 6 * CW }));
    expect(t.width).toBe(6 * CW);
    expect(t.height).toBeCloseTo(2 * lineHeightPx(FS), 9);
  });
});

describe('requiredShapeHeight', () => {
  const long = 'the quick brown fox jumps over the lazy dog and keeps running far away';
  it('is MIN_SHAPE_SIZE without a label', () => {
    expect(requiredShapeHeight(shapeEl('rectangle'))).toBe(MIN_SHAPE_SIZE);
  });
  it.each(SHAPE_KINDS)('gives a %s label box at least as tall as the text', (kind) => {
    for (const label of ['Hi', long]) {
      const s = shapeEl(kind, { label, width: 140, height: 40 });
      const h = requiredShapeHeight(s);
      const fitted = { ...s, height: h };
      const box = SHAPES[kind].labelBox({ x: fitted.x, y: fitted.y, width: fitted.width, height: fitted.height });
      const lines = wrapText(label, FONT, box.width);
      expect(box.height).toBeGreaterThanOrEqual(lines.length * lineHeightPx(FS) - 1e-6);
      expect(h).toBeGreaterThanOrEqual(MIN_SHAPE_SIZE);
    }
  });
  it('more text needs a taller shape', () => {
    const a = requiredShapeHeight(shapeEl('rectangle', { label: 'Hi', width: 140, height: 40 }));
    const b = requiredShapeHeight(shapeEl('rectangle', { label: long, width: 140, height: 40 }));
    expect(b).toBeGreaterThan(a);
  });
});
