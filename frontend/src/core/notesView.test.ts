import { describe, expect, it } from 'vitest';
import { clampCaret, inNotesColumn, isBelowNotes, isSafeOpenUrl, normalizeLinkUrl, panToCaret, placePopup } from './notesView';

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

describe('placePopup', () => {
  const bounds = { left: 0, top: 0, right: 1000, bottom: 700 };
  it('goes below the caret when it fits', () => {
    const p = placePopup({ left: 100, top: 100, bottom: 120 }, { width: 300, height: 200 }, bounds);
    expect(p).toMatchObject({ left: 100, top: 126, placement: 'below' });
  });
  it('flips above near the bottom of the stage', () => {
    const p = placePopup({ left: 100, top: 600, bottom: 620 }, { width: 300, height: 300 }, bounds);
    expect(p.placement).toBe('above');
    expect(p.top).toBe(600 - 6 - 300);
  });
  it('shrinks to the larger side when neither fits', () => {
    const p = placePopup({ left: 100, top: 300, bottom: 320 }, { width: 300, height: 900 }, bounds);
    expect(p.placement).toBe('below');
    expect(p.maxHeight).toBe(700 - 8 - 326);
  });
  it('clamps to the left and right edges', () => {
    expect(placePopup({ left: -50, top: 100, bottom: 120 }, { width: 300, height: 100 }, bounds).left).toBe(8);
    expect(placePopup({ left: 950, top: 100, bottom: 120 }, { width: 300, height: 100 }, bounds).left).toBe(1000 - 8 - 300);
  });
  it('prefers above for a toolbar and falls back below at the top', () => {
    expect(placePopup({ left: 100, top: 300, bottom: 400 }, { width: 200, height: 36 }, bounds, { prefer: 'above' }).placement).toBe('above');
    expect(placePopup({ left: 100, top: 20, bottom: 120 }, { width: 200, height: 36 }, bounds, { prefer: 'above' }).placement).toBe('below');
  });
});

describe('isSafeOpenUrl', () => {
  it('allows http, https and mailto only', () => {
    expect(isSafeOpenUrl('https://example.com/a?b=1')).toBe(true);
    expect(isSafeOpenUrl('HTTP://example.com')).toBe(true);
    expect(isSafeOpenUrl(' mailto:a@b.c ')).toBe(true);
    expect(isSafeOpenUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeOpenUrl('data:text/html,hi')).toBe(false);
    expect(isSafeOpenUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeOpenUrl('/local')).toBe(false);
    expect(isSafeOpenUrl('#top')).toBe(false);
    expect(isSafeOpenUrl('')).toBe(false);
    expect(isSafeOpenUrl(null)).toBe(false);
  });
});
