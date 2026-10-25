// rough.js drawable generation (element-local coordinates) with a WeakMap + position-independent LRU cache (WP2).
import rough from 'roughjs';
import type { Drawable, Options } from 'roughjs/bin/core';
import type { ArrowElement, ChalkElement, Point, ShapeElement, Style } from '../types';
import { ARROWHEAD_ANGLE_DEG, ARROWHEAD_BASE, DRAWABLE_CACHE_LIMIT } from '../constants';
import { add, len, normalize, rotate, scale, sub } from '../core/math';
import { SHAPES } from '../core/shapes';

const gen = rough.generator();

/** Drawables are generated relative to this point and translated at draw time. */
export function drawOrigin(el: ChalkElement): Point {
  return el.type === 'arrow' ? { x: el.start.x, y: el.start.y } : { x: el.x, y: el.y };
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

function styleKey(s: Style): unknown[] {
  return [s.strokeColor, s.backgroundColor, s.fillStyle, s.strokeWidth, s.strokeStyle, s.roughness, s.edges, s.startArrowhead, s.endArrowhead];
}

/** Position-independent cache key. Excludes x/y, opacity, fonts and labels. '' for text (no drawables). */
export function shapeKey(el: ChalkElement): string {
  if (el.type === 'shape') return JSON.stringify(['s', el.shape, r2(el.width), r2(el.height), styleKey(el.style), el.seed]);
  if (el.type === 'arrow') {
    return JSON.stringify(['a', r2(el.end.x - el.start.x), r2(el.end.y - el.start.y), styleKey(el.style), el.seed]);
  }
  return '';
}

function roughOptions(el: ChalkElement): Options {
  const style = el.style;
  const sw = style.strokeWidth;
  return {
    seed: el.seed,
    roughness: style.roughness,
    stroke: style.strokeColor,
    strokeWidth: sw,
    fill: style.backgroundColor === 'transparent' ? undefined : style.backgroundColor,
    fillStyle: style.fillStyle,
    hachureGap: 6 + 2 * sw,
    fillWeight: sw / 2,
    strokeLineDash: style.strokeStyle === 'dashed' ? [8, 6 + sw] : style.strokeStyle === 'dotted' ? [1.5, 5 + sw] : undefined,
    disableMultiStroke: style.strokeStyle !== 'solid',
    preserveVertices: style.roughness === 0,
  };
}

/**
 * Points of the two barbs of an arrowhead. `u` points from the tip back along the shaft;
 * the barbs are `u` rotated by +/- angleDeg, scaled by size. Degenerate shafts return [tip, tip].
 */
export function arrowheadPoints(tip: Point, from: Point, size: number, angleDeg: number): [Point, Point] {
  const back = sub(from, tip);
  if (len(back) === 0) return [{ x: tip.x, y: tip.y }, { x: tip.x, y: tip.y }];
  const u = normalize(back);
  return [add(tip, scale(rotate(u, angleDeg), size)), add(tip, scale(rotate(u, -angleDeg), size))];
}

function shapeDrawables(el: ShapeElement, opts: Options): Drawable[] {
  const r = { x: 0, y: 0, width: el.width, height: el.height };
  const def = SHAPES[el.shape];
  const d = def.path?.(r, el.style);
  if (typeof d === 'string') return [gen.path(d, opts)];
  const outline = def.outline(r);
  if (outline.kind === 'ellipse') return [gen.ellipse(outline.cx, outline.cy, 2 * outline.rx, 2 * outline.ry, opts)];
  return [gen.polygon(outline.points.map((p): [number, number] => [p.x, p.y]), opts)];
}

function arrowDrawables(el: ArrowElement, opts: Options): Drawable[] {
  const dx = el.end.x - el.start.x;
  const dy = el.end.y - el.start.y;
  const length = Math.hypot(dx, dy);
  const sw = el.style.strokeWidth;
  const out: Drawable[] = [gen.line(0, 0, dx, dy, opts)];
  if (length > 0) {
    const size = Math.min(ARROWHEAD_BASE + 3 * sw, 0.4 * length);
    const start: Point = { x: 0, y: 0 };
    const end: Point = { x: dx, y: dy };
    const heads: [Point, Point, ArrowElement['style']['endArrowhead']][] = [
      [end, start, el.style.endArrowhead],
      [start, end, el.style.startArrowhead],
    ];
    for (const [tip, from, kind] of heads) {
      if (kind === 'none') continue;
      const [w1, w2] = arrowheadPoints(tip, from, size, ARROWHEAD_ANGLE_DEG);
      if (kind === 'arrow') {
        out.push(gen.linearPath([[w1.x, w1.y], [tip.x, tip.y], [w2.x, w2.y]], { ...opts, fill: undefined }));
      } else {
        out.push(gen.polygon([[tip.x, tip.y], [w1.x, w1.y], [w2.x, w2.y]], { ...opts, fill: el.style.strokeColor, fillStyle: 'solid' }));
      }
    }
  }
  return out;
}

let byObject = new WeakMap<ChalkElement, Drawable[]>();
const lru = new Map<string, Drawable[]>();

/** Drawables in element-local coordinates (translate by drawOrigin to draw). Text has none. */
export function getDrawables(el: ChalkElement): readonly Drawable[] {
  if (el.type === 'text') return [];
  const fast = byObject.get(el);
  if (fast) return fast;
  const key = shapeKey(el);
  const hit = lru.get(key);
  if (hit) {
    lru.delete(key);
    lru.set(key, hit);
    byObject.set(el, hit);
    return hit;
  }
  const opts = roughOptions(el);
  const made = el.type === 'shape' ? shapeDrawables(el, opts) : arrowDrawables(el, opts);
  lru.set(key, made);
  if (lru.size > DRAWABLE_CACHE_LIMIT) {
    const oldest = lru.keys().next().value;
    if (oldest !== undefined) lru.delete(oldest);
  }
  byObject.set(el, made);
  return made;
}

export function clearDrawableCache(): void {
  lru.clear();
  byObject = new WeakMap();
}
