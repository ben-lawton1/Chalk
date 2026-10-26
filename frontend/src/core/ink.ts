// Freehand ink strokes: creation, bounds, distances and resize mapping (v3). Pure; the outline itself is built in render/ink.ts.
import type { InkElement, InkPoint, Point, Rect, Style } from '../types';
import { clamp, distToSegment } from './math';
import { newId, newSeed } from './ids';

/** `+ 0` turns -0 into 0. */
const r2 = (v: number): number => Math.round(v * 100) / 100 + 0;
const r3 = (v: number): number => Math.round(v * 1000) / 1000 + 0;

/** Absolute world points (any `p` outside 0..1 is clamped) -> min-corner x/y, relative rounded points, and their extent. */
export function normaliseInk(points: readonly InkPoint[]): Pick<InkElement, 'x' | 'y' | 'width' | 'height' | 'points'> {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const q of points) {
    minX = Math.min(minX, q.x);
    minY = Math.min(minY, q.y);
    maxX = Math.max(maxX, q.x);
    maxY = Math.max(maxY, q.y);
  }
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0, points: [] };
  const x = r2(minX);
  const y = r2(minY);
  const rel = points.map((q): InkPoint => ({ x: r2(q.x - x), y: r2(q.y - y), p: r3(clamp(q.p, 0, 1)) }));
  let width = 0;
  let height = 0;
  for (const q of rel) {
    width = Math.max(width, q.x);
    height = Math.max(height, q.y);
  }
  return { x, y, width, height, points: rel };
}

/** `worldPoints` are ABSOLUTE; `pressure` says whether `p` is real pen pressure. The style's strokeWidth is the pen size. */
export function createInk(worldPoints: readonly InkPoint[], pressure: boolean, style: Style): InkElement {
  return { id: newId(), seed: newSeed(), type: 'ink', ...normaliseInk(worldPoints), pressure, style: { ...style } };
}

/** The points box (without the stroke width). */
export function inkBounds(el: InkElement): Rect {
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

/** Absolute world points of the stroke. */
export function inkWorldPoints(el: InkElement): Point[] {
  return el.points.map((q) => ({ x: el.x + q.x, y: el.y + q.y }));
}

/** Distance from p (world) to the stroke's centre line. A single point is a distance to that point. */
export function distanceToInk(el: InkElement, p: Point): number {
  const pts = el.points;
  if (pts.length === 0) return Infinity;
  const px = p.x - el.x;
  const py = p.y - el.y;
  if (pts.length === 1) return Math.hypot(px - pts[0]!.x, py - pts[0]!.y);
  const q = { x: px, y: py };
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, distToSegment(q, pts[i - 1]!, pts[i]!));
  return best;
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(a, b, c);
  const d2 = o(a, b, d);
  const d3 = o(c, d, a);
  const d4 = o(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Distance between the segment a-b (world) and the stroke's centre line; 0 when they cross. For the eraser. */
export function segmentDistanceToInk(el: InkElement, a: Point, b: Point): number {
  const pts = el.points;
  if (pts.length === 0) return Infinity;
  const la = { x: a.x - el.x, y: a.y - el.y };
  const lb = { x: b.x - el.x, y: b.y - el.y };
  if (pts.length === 1) return distToSegment(pts[0]!, la, lb);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const c = pts[i - 1]!;
    const d = pts[i]!;
    if (segmentsCross(la, lb, c, d)) return 0;
    best = Math.min(best, distToSegment(la, c, d), distToSegment(lb, c, d), distToSegment(c, la, lb), distToSegment(d, la, lb));
  }
  return best;
}

/**
 * Resize mapping: maps the absolute points through mapX / mapY, renormalises (so flips work) and scales the stroke width
 * by `widthScale` (never below 0.5). Returns a new element with the same id.
 */
export function transformInk(el: InkElement, mapX: (x: number) => number, mapY: (y: number) => number, widthScale: number): InkElement {
  const abs: InkPoint[] = el.points.map((q) => ({ x: mapX(el.x + q.x), y: mapY(el.y + q.y), p: q.p }));
  const strokeWidth = Math.max(0.5, el.style.strokeWidth * widthScale);
  return { ...el, ...normaliseInk(abs), style: { ...el.style, strokeWidth } };
}
