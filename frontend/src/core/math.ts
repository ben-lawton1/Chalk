// Pure 2D vector and rectangle helpers shared by every module (WP0).
import type { Point, Rect } from '../types';

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}
export function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}
export function scale(a: Point, s: number): Point {
  return { x: a.x * s, y: a.y * s };
}
export function len(a: Point): number {
  return Math.hypot(a.x, a.y);
}
export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
/** Zero vector gives {0, 0}. */
export function normalize(a: Point): Point {
  const l = Math.hypot(a.x, a.y);
  if (l === 0) return { x: 0, y: 0 };
  return { x: a.x / l, y: a.y / l };
}
/** Counter-clockwise in math orientation: rotate({1,0}, 90) is {0,1}. */
export function rotate(a: Point, deg: number): Point {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}
export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
/** sgn(0) === 1. */
export function sgn(v: number): 1 | -1 {
  return v < 0 ? -1 : 1;
}
/** |b| < 1e-9 gives the fallback (default 1). */
export function safeDiv(a: number, b: number, fallback = 1): number {
  return Math.abs(b) < 1e-9 ? fallback : a / b;
}
export function nearlyEqual(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}
export function pointsNear(a: Point, b: Point, eps = 1e-3): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}
export function distToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / l2, 0, 1);
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}
/** Normalized rectangle spanning two corner points. */
export function rectFromPoints(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}
export function rectCenter(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}
/** Grows each side by d (d may be negative; size floors at 0 and the center is kept). */
export function expandRect(r: Rect, d: number): Rect {
  const w = Math.max(0, r.width + 2 * d);
  const h = Math.max(0, r.height + 2 * d);
  return { x: r.x + (r.width - w) / 2, y: r.y + (r.height - h) / 2, width: w, height: h };
}
export function unionRects(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width, b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: x2 - x, height: y2 - y };
}
/** Inclusive. */
export function rectContainsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}
/** Inclusive. */
export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}
/** Inclusive: touching rectangles intersect. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}
/** Same length from origin, angle rounded to the nearest multiple of stepDeg. */
export function snapAngle(origin: Point, p: Point, stepDeg: number): Point {
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  const l = Math.hypot(dx, dy);
  if (l === 0) return { x: p.x, y: p.y };
  const step = (stepDeg * Math.PI) / 180;
  const a = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: origin.x + Math.cos(a) * l, y: origin.y + Math.sin(a) * l };
}
