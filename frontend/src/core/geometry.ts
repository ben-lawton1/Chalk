// Bounds, outlines, hit testing, selection boxes and resize handles (WP1).
import type {
  ArrowElement, BindableElement, ChalkElement, EndpointId, HandleId, HandleMode, HitResult, Outline, Point, Rect, Viewport,
} from '../types';
import {
  ARROW_LABEL_BG_PAD, ENDPOINT_HIT_PX, HANDLE_HIT_PX, HIT_TOLERANCE_PX, SELECTION_PADDING_PX, SIDE_HANDLE_MIN_PX,
} from '../constants';
import { distToSegment, expandRect, rectContainsPoint, rectContainsRect, rectFromPoints, unionRects } from './math';
import { worldToScreen } from './viewport';
import { SHAPES } from './shapes';
import { layoutText } from './text';

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

/** Shape/text: its own rect. Arrow: the start-end rect united with its label box. */
export function getBounds(el: ChalkElement): Rect {
  if (el.type !== 'arrow') return { x: el.x, y: el.y, width: el.width, height: el.height };
  const base = rectFromPoints(el.start, el.end);
  const l = el.label === '' ? null : layoutText(el);
  return l ? unionRects(base, { x: l.x, y: l.y, width: l.width, height: l.height }) : base;
}

/** null for an empty list. */
export function getCommonBounds(els: readonly ChalkElement[]): Rect | null {
  let out: Rect | null = null;
  for (const el of els) {
    const b = getBounds(el);
    out = out ? unionRects(out, b) : b;
  }
  return out;
}

export function isBindable(el: ChalkElement): el is BindableElement {
  return el.type === 'shape' || el.type === 'text';
}

// ---------------------------------------------------------------------------
// Outlines
// ---------------------------------------------------------------------------

function rectPolygon(r: Rect): Outline {
  return {
    kind: 'polygon',
    points: [
      { x: r.x, y: r.y },
      { x: r.x + r.width, y: r.y },
      { x: r.x + r.width, y: r.y + r.height },
      { x: r.x, y: r.y + r.height },
    ],
  };
}

/** Shape: the registry outline of its rect. Text: its bounds as a polygon. */
export function getOutline(el: BindableElement): Outline {
  const r = { x: el.x, y: el.y, width: el.width, height: el.height };
  return el.type === 'shape' ? SHAPES[el.shape].outline(r) : rectPolygon(r);
}

/** Polygon: even-odd ray casting. Ellipse: implicit equation (false when a radius is 0). */
export function isPointInsideOutline(o: Outline, p: Point): boolean {
  if (o.kind === 'ellipse') {
    if (o.rx <= 0 || o.ry <= 0) return false;
    const nx = (p.x - o.cx) / o.rx;
    const ny = (p.y - o.cy) / o.ry;
    return nx * nx + ny * ny <= 1;
  }
  const pts = o.points;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Distance from p to the outline curve (not to the area). */
export function distanceToOutline(o: Outline, p: Point): number {
  if (o.kind === 'ellipse') {
    if (o.rx <= 0 || o.ry <= 0) return Math.hypot(p.x - o.cx, p.y - o.cy);
    const nx = (p.x - o.cx) / o.rx;
    const ny = (p.y - o.cy) / o.ry;
    return Math.abs(Math.sqrt(nx * nx + ny * ny) - 1) * Math.min(o.rx, o.ry);
  }
  const pts = o.points;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    best = Math.min(best, distToSegment(p, pts[i]!, pts[(i + 1) % pts.length]!));
  }
  return best;
}

/** The farthest intersection of the ray origin + t*dir (t > 0) with the outline, or null. */
export function rayExit(o: Outline, origin: Point, dir: Point): Point | null {
  if (Math.hypot(dir.x, dir.y) < 1e-9) return null;
  if (o.kind === 'ellipse') {
    if (o.rx <= 0 || o.ry <= 0) return null;
    const ox = origin.x - o.cx;
    const oy = origin.y - o.cy;
    const A = (dir.x / o.rx) ** 2 + (dir.y / o.ry) ** 2;
    const B = 2 * ((ox * dir.x) / (o.rx * o.rx) + (oy * dir.y) / (o.ry * o.ry));
    const C = (ox / o.rx) ** 2 + (oy / o.ry) ** 2 - 1;
    const disc = B * B - 4 * A * C;
    if (A < 1e-12 || disc < 0) return null;
    const t = (-B + Math.sqrt(disc)) / (2 * A);
    if (t <= 0) return null;
    return { x: origin.x + t * dir.x, y: origin.y + t * dir.y };
  }
  const pts = o.points;
  let bestT = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const denom = dir.x * ey - dir.y * ex;
    if (Math.abs(denom) < 1e-12) continue;
    const wx = a.x - origin.x;
    const wy = a.y - origin.y;
    const t = (wx * ey - wy * ex) / denom;
    const u = (wx * dir.y - wy * dir.x) / denom;
    if (u >= -1e-9 && u <= 1 + 1e-9 && t > 1e-9 && t > bestT) bestT = t;
  }
  if (bestT === -Infinity) return null;
  return { x: origin.x + bestT * dir.x, y: origin.y + bestT * dir.y };
}

// ---------------------------------------------------------------------------
// Hit testing (spec section 10)
// ---------------------------------------------------------------------------

/** max(HIT_TOLERANCE_PX / zoom, strokeWidth / 2), in world units. */
export function hitTolerance(el: ChalkElement, zoom: number): number {
  return Math.max(HIT_TOLERANCE_PX / zoom, el.style.strokeWidth / 2);
}

export function hitTestElement(el: ChalkElement, p: Point, zoom: number): 'strong' | 'hollow' | null {
  const tol = hitTolerance(el, zoom);
  if (!rectContainsPoint(expandRect(getBounds(el), tol), p)) return null;
  if (el.type === 'shape') {
    const o = getOutline(el);
    if (distanceToOutline(o, p) <= tol) return 'strong';
    if (isPointInsideOutline(o, p)) return el.style.backgroundColor !== 'transparent' || el.label !== '' ? 'strong' : 'hollow';
    return null;
  }
  if (el.type === 'text') return 'strong';
  if (distToSegment(p, el.start, el.end) <= tol) return 'strong';
  const l = el.label === '' ? null : layoutText(el);
  if (l && rectContainsPoint(expandRect({ x: l.x, y: l.y, width: l.width, height: l.height }, ARROW_LABEL_BG_PAD), p)) return 'strong';
  return null;
}

/** Pass 1: top-most strong hit. Pass 2: the smallest hollow hit (ties: top-most). */
export function hitTest(elements: readonly ChalkElement[], p: Point, zoom: number): HitResult | null {
  let hollow: ChalkElement | null = null;
  let hollowArea = Infinity;
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]!;
    const h = hitTestElement(el, p, zoom);
    if (h === 'strong') return { element: el, hollow: false };
    if (h === 'hollow') {
      const b = getBounds(el);
      const area = b.width * b.height;
      if (area < hollowArea) {
        hollowArea = area;
        hollow = el;
      }
    }
  }
  return hollow ? { element: hollow, hollow: true } : null;
}

/** Ids, in z-order, of the elements whose bounds are fully inside r. */
export function elementsInRect(elements: readonly ChalkElement[], r: Rect): string[] {
  const out: string[] = [];
  for (const el of elements) if (rectContainsRect(r, getBounds(el))) out.push(el.id);
  return out;
}

// ---------------------------------------------------------------------------
// Selection and handles
// ---------------------------------------------------------------------------

function selected(elements: readonly ChalkElement[], selectedIds: readonly string[]): ChalkElement[] {
  if (selectedIds.length === 0) return [];
  const ids = new Set(selectedIds);
  return elements.filter((e) => ids.has(e.id));
}

export function getHandleMode(elements: readonly ChalkElement[], selectedIds: readonly string[]): HandleMode {
  const sel = selected(elements, selectedIds);
  if (sel.length === 0) return 'none';
  if (sel.length === 1) {
    const only = sel[0]!;
    if (only.type === 'arrow') return 'endpoints';
    if (only.type === 'text') return 'text';
  }
  return 'box';
}

/** Unpadded common bounds of the selected elements, or null. */
export function getSelectionBox(elements: readonly ChalkElement[], selectedIds: readonly string[]): Rect | null {
  return getCommonBounds(selected(elements, selectedIds));
}

/** WORLD point of a handle on the box that is passed in (callers pass the UNPADDED box). */
export function handlePoint(box: Rect, handle: HandleId): Point {
  const x = handle.includes('w') ? box.x : handle.includes('e') ? box.x + box.width : box.x + box.width / 2;
  const y = handle.includes('n') ? box.y : handle.includes('s') ? box.y + box.height : box.y + box.height / 2;
  return { x, y };
}

const CORNERS: readonly HandleId[] = ['nw', 'ne', 'se', 'sw'];
const SIDES: readonly HandleId[] = ['n', 'e', 's', 'w'];

/** SCREEN positions of the visible handles of the padded selection box. */
export function getHandlePositions(box: Rect, v: Viewport, mode: 'box' | 'text'): Partial<Record<HandleId, Point>> {
  const padded = expandRect(box, SELECTION_PADDING_PX / v.zoom);
  const out: Partial<Record<HandleId, Point>> = {};
  const screenW = padded.width * v.zoom;
  const screenH = padded.height * v.zoom;
  const visible: HandleId[] = [...CORNERS];
  if (mode === 'text') {
    visible.push('e', 'w');
  } else {
    if (screenW >= SIDE_HANDLE_MIN_PX) visible.push('n', 's');
    if (screenH >= SIDE_HANDLE_MIN_PX) visible.push('e', 'w');
  }
  for (const h of [...CORNERS, ...SIDES]) {
    if (visible.includes(h)) out[h] = worldToScreen(handlePoint(padded, h), v);
  }
  return out;
}

/** Corners are tested before sides. A handle is hit when max(|dx|, |dy|) <= HANDLE_HIT_PX / 2. */
export function hitHandle(box: Rect, screen: Point, v: Viewport, mode: 'box' | 'text'): HandleId | null {
  const pos = getHandlePositions(box, v, mode);
  const half = HANDLE_HIT_PX / 2;
  for (const h of [...CORNERS, ...SIDES]) {
    const hp = pos[h];
    if (hp && Math.max(Math.abs(screen.x - hp.x), Math.abs(screen.y - hp.y)) <= half) return h;
  }
  return null;
}

/** The nearer arrow end within ENDPOINT_HIT_PX of the screen point (ties go to 'end'), else null. */
export function hitEndpoint(a: ArrowElement, screen: Point, v: Viewport): EndpointId | null {
  const s = worldToScreen(a.start, v);
  const e = worldToScreen(a.end, v);
  const ds = Math.hypot(screen.x - s.x, screen.y - s.y);
  const de = Math.hypot(screen.x - e.x, screen.y - e.y);
  if (Math.min(ds, de) > ENDPOINT_HIT_PX) return null;
  return de <= ds ? 'end' : 'start';
}

export const HANDLE_CURSORS: Record<HandleId, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
};
