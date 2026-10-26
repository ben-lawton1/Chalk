// Freehand ink: perfect-freehand outline of a stroke, drawn as one filled Path2D (v3).
import { getStroke } from 'perfect-freehand';
import type { InkElement, InkPoint, Point } from '../types';
import { INK_SMOOTHING, INK_STREAMLINE, INK_THINNING } from '../constants';

/**
 * The closed outline of a stroke, in the stroke's own (relative) coordinates. `pressure` = the points carry real pen
 * pressure; otherwise perfect-freehand simulates it from the drawing speed. A single point gives a dot.
 */
export function inkOutline(points: readonly InkPoint[], size: number, pressure: boolean): Point[] {
  if (points.length === 0) return [];
  // Simulated pressure starts from the first sample's p, so a stroke without real pressure feeds a constant.
  const input = points.map((q) => [q.x, q.y, pressure ? q.p : 0.5]);
  const outline = getStroke(input, {
    size, thinning: INK_THINNING, smoothing: INK_SMOOTHING, streamline: INK_STREAMLINE, simulatePressure: !pressure, last: true,
  });
  return outline.map(([x, y]) => ({ x: x!, y: y! }));
}

interface CachedPath { size: number; pressure: boolean; path: Path2D }
const paths = new WeakMap<readonly InkPoint[], CachedPath>();

/** Browser only. Cached by the (immutable) points array, so a drag, which only changes x/y, never rebuilds it. */
export function inkPath(el: InkElement): Path2D {
  const size = el.style.strokeWidth;
  const hit = paths.get(el.points);
  if (hit && hit.size === size && hit.pressure === el.pressure) return hit.path;
  const outline = inkOutline(el.points, size, el.pressure);
  const path = new Path2D();
  if (outline.length > 0) {
    // Quadratic curves through the midpoints of the outline edges, the smoothing perfect-freehand recommends.
    const first = outline[0]!;
    const last = outline[outline.length - 1]!;
    path.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i]!;
      const b = outline[(i + 1) % outline.length]!;
      path.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    path.closePath();
  }
  paths.set(el.points, { size, pressure: el.pressure, path });
  return path;
}

/** Fills the stroke in its colour. The caller sets the world transform and globalAlpha. */
export function drawInk(ctx: CanvasRenderingContext2D, el: InkElement): void {
  ctx.save();
  ctx.translate(el.x, el.y);
  ctx.fillStyle = el.style.strokeColor;
  ctx.fill(inkPath(el));
  ctx.restore();
}
