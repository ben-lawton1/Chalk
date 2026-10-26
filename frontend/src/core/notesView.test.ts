import { describe, expect, it } from 'vitest';
import { clampCaret, inNotesColumn, isBelowNotes, normalizeLinkUrl, panToCaret } from './notesView';

const bounds = { x: 48, y: 48, width: 760, height: 200 };

describe('inNotesColumn', () => {
  it('hits inside the rect and misses outside it', () => {
    expect(inNotesColumn({ x: 100, y: 100 }, bounds, true)).toBe(true);
    expect(inNotesColumn({ x: 20, y: 100 }, bounds, true)).toBe(false);
    expect(inNotesColumn({ x: 900, y: 100 }, bounds, true)).toBe(false);
    expect(inNotesColumn({ x: 100, y: 10 }, bounds, true)).toBe(false);
  });
  it('gives 400 world px of slack below a column that has content', () => {
    expect(inNotesColumn({ x: 100, y: 248 + 400 }, bounds, true)).toBe(true);
    expect(inNotesColumn({ x: 100, y: 248 + 401 }, bounds, true)).toBe(false);
  });
  it('gives no slack to an empty column', () => {
    expect(inNotesColumn({ x: 100, y: 300 }, bounds, false)).toBe(false);
    expect(inNotesColumn({ x: 100, y: 200 }, bounds, false)).toBe(true);
  });
  it('is false without bounds', () => {
    expect(inNotesColumn({ x: 100, y: 100 }, null, true)).toBe(false);
  });
});

describe('isBelowNotes', () => {
  it('compares against the bottom edge', () => {
    expect(isBelowNotes({ x: 100, y: 249 }, bounds)).toBe(true);
    expect(isBelowNotes({ x: 100, y: 200 }, bounds)).toBe(false);
    expect(isBelowNotes({ x: 100, y: 200 }, null)).toBe(false);
  });
});

describe('clampCaret', () => {
  it('clamps into [0, size] and rounds', () => {
    expect(clampCaret(5, 20)).toBe(5);
    expect(clampCaret(99, 20)).toBe(20);
    expect(clampCaret(-4, 20)).toBe(0);
    expect(clampCaret(3.6, 20)).toBe(4);
  });
  it('uses the fallback for junk', () => {
    expect(clampCaret(null, 20)).toBe(0);
    expect(clampCaret('7', 20, 9)).toBe(9);
    expect(clampCaret(NaN, 20, 50)).toBe(20);
    expect(clampCaret(4, NaN)).toBe(0);
  });
});

describe('panToCaret', () => {
  const size = { width: 1000, height: 600 };
  it('returns the same viewport when the caret is visible', () => {
    const v = { scrollX: 0, scrollY: 0, zoom: 1 };
    expect(panToCaret(v, { x: 100, top: 100, bottom: 120 }, size)).toBe(v);
  });
  it('puts an off-screen caret a third down the stage and keeps the zoom', () => {
    const v = { scrollX: 0, scrollY: 0, zoom: 2 };
    const r = panToCaret(v, { x: 100, top: 1500, bottom: 1520 }, size);
    expect(r.zoom).toBe(2);
    expect((1500 + r.scrollY) * 2).toBeCloseTo(200);
    expect(r.scrollX).toBe(0);
  });
  it('pans for a caret inside the bottom margin', () => {
    const v = { scrollX: 0, scrollY: 0, zoom: 1 };
    expect(panToCaret(v, { x: 100, top: 570, bottom: 590 }, size)).not.toBe(v);
  });
  it('centres horizontally when the caret is off to the side', () => {
    const v = { scrollX: 0, scrollY: 0, zoom: 1 };
    const r = panToCaret(v, { x: 2000, top: 100, bottom: 120 }, size);
    expect(r.scrollX + 2000).toBeCloseTo(500);
    expect(r.scrollY).toBe(0);
  });
  it('ignores an unmeasured stage', () => {
    const v = { scrollX: 0, scrollY: 0, zoom: 1 };
    expect(panToCaret(v, { x: 5000, top: 5000, bottom: 5020 }, { width: 0, height: 0 })).toBe(v);
  });
});

describe('normalizeLinkUrl', () => {
  it('adds https and keeps schemes, paths and anchors', () => {
    expect(normalizeLinkUrl(' example.com/a ')).toBe('https://example.com/a');
    expect(normalizeLinkUrl('http://x.y')).toBe('http://x.y');
    expect(normalizeLinkUrl('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(normalizeLinkUrl('/local')).toBe('/local');
    expect(normalizeLinkUrl('#top')).toBe('#top');
    expect(normalizeLinkUrl('  ')).toBe('');
  });
});
