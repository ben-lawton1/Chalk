// Pure helpers for the notes column's place on the canvas: hit test, caret clamping, pan to the caret, URL clean-up (v4 N-B).
import type { Point, Rect, Size, Viewport } from '../types';
import { NOTES_BELOW_SLACK, NOTES_CARET_MARGIN_PX } from '../constants';

/**
 * Is a world point "in the notes column" for the double-click / double-tap entry? Inside the measured rect, or (for a page that has
 * notes) up to `slack` world px below it. An empty column does not get the slack, so double-click on a blank page still makes text.
 */
export function inNotesColumn(world: Point, bounds: Rect | null, hasContent: boolean, slack: number = NOTES_BELOW_SLACK): boolean {
  if (!bounds) return false;
  if (world.x < bounds.x || world.x > bounds.x + bounds.width) return false;
  const bottom = bounds.y + bounds.height + (hasContent ? slack : 0);
  return world.y >= bounds.y && world.y <= bottom;
}

/** True when the point lies under the last block (the caret then goes to the end of the document). */
export function isBelowNotes(world: Point, bounds: Rect | null): boolean {
  return bounds !== null && world.y > bounds.y + bounds.height;
}

/** An integer document position in [0, docSize]; anything unusable becomes `fallback` (also clamped). */
export function clampCaret(pos: unknown, docSize: number, fallback = 0): number {
  const size = Number.isFinite(docSize) && docSize > 0 ? Math.floor(docSize) : 0;
  if (typeof pos !== 'number' || !Number.isFinite(pos)) return Math.min(Math.max(Math.floor(fallback), 0), size);
  return Math.min(Math.max(Math.round(pos), 0), size);
}

/** The caret line in world coordinates. */
export interface CaretWorld { x: number; top: number; bottom: number }

/**
 * Pans (never zooms) so the caret line is visible. Returns `v` itself when it already is within the margin; otherwise the caret line
 * goes about a third down the stage (and, if the caret is off to the side, to the middle).
 */
export function panToCaret(v: Viewport, caret: CaretWorld, size: Size, margin: number = NOTES_CARET_MARGIN_PX): Viewport {
  if (size.width <= 0 || size.height <= 0) return v;
  const top = (caret.top + v.scrollY) * v.zoom;
  const bottom = (caret.bottom + v.scrollY) * v.zoom;
  const x = (caret.x + v.scrollX) * v.zoom;
  const vertOk = top >= margin && bottom <= size.height - margin;
  const horizOk = x >= 0 && x <= size.width;
  if (vertOk && horizOk) return v;
  return {
    ...v,
    scrollY: vertOk ? v.scrollY : size.height / 3 / v.zoom - caret.top,
    scrollX: horizOk ? v.scrollX : size.width / 2 / v.zoom - caret.x,
  };
}

/** Link text from the Ctrl+K prompt: trimmed; no scheme gets https://; absolute paths, anchors and mailto-style schemes stay. */
export function normalizeLinkUrl(raw: string): string {
  const t = raw.trim();
  if (t === '') return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('/') || t.startsWith('#')) return t;
  return 'https://' + t;
}
