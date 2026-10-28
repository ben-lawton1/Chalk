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

/** Only web and mail links are opened from the notes column (no javascript:, data:, file: ...). Relative hrefs do not count. */
export function isSafeOpenUrl(href: string | null | undefined): boolean {
  if (!href) return false;
  try {
    const p = new URL(href.trim()).protocol;
    return p === 'http:' || p === 'https:' || p === 'mailto:';
  } catch {
    return false;
  }
}

/** The part of the screen a popup must stay inside (client px). */
export interface PopupBounds { left: number; top: number; right: number; bottom: number }
/** The anchor line a popup hangs off, e.g. the caret's `coordsAtPos` (client px). */
export interface PopupAnchor { left: number; top: number; bottom: number }
export interface PopupPlacement { left: number; top: number; maxHeight: number; placement: 'below' | 'above' }

/**
 * Places a popup of size `w` x `h` next to an anchor line, inside `bounds`. It goes below the anchor (or above, with `prefer: 'above'`);
 * when it does not fit there it flips to the side with more room, and `maxHeight` shrinks it to fit (it then scrolls). The left edge is
 * clamped so the popup stays inside the bounds.
 */
export function placePopup(
  anchor: PopupAnchor,
  size: Size,
  bounds: PopupBounds,
  opts: { gap?: number; margin?: number; prefer?: 'below' | 'above' } = {},
): PopupPlacement {
  const gap = opts.gap ?? 6;
  const margin = opts.margin ?? 8;
  const prefer = opts.prefer ?? 'below';
  const minLeft = bounds.left + margin;
  const maxLeft = Math.max(minLeft, bounds.right - margin - size.width);
  const left = Math.min(Math.max(anchor.left, minLeft), maxLeft);
  const below = Math.max(0, bounds.bottom - margin - (anchor.bottom + gap));
  const above = Math.max(0, anchor.top - gap - (bounds.top + margin));
  const fitsBelow = size.height <= below;
  const fitsAbove = size.height <= above;
  let placement: 'below' | 'above';
  if (prefer === 'below') placement = fitsBelow || (!fitsAbove && below >= above) ? 'below' : 'above';
  else placement = fitsAbove || (!fitsBelow && above >= below) ? 'above' : 'below';
  const room = placement === 'below' ? below : above;
  const used = Math.min(size.height, room);
  const top = placement === 'below' ? anchor.bottom + gap : anchor.top - gap - used;
  return { left, top, maxHeight: Math.max(0, room), placement };
}
