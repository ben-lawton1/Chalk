// Static-layer scene drawing and canvas text placement matching the CSS line box (WP2).
import rough from 'roughjs';
import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { ChalkElement, TextLayout, Viewport } from '../types';
import { ARROW_LABEL_BG_PAD, CANVAS_BACKGROUND, CULL_MARGIN_PX, GRID_COLOR, GRID_DOT_PX, GRID_MIN_SPACING_PX, GRID_SIZE } from '../constants';
import { expandRect, rectsIntersect } from '../core/math';
import { visibleWorldRect } from '../core/viewport';
import { getBounds } from '../core/geometry';
import { layoutText } from '../core/text';
import { drawOrigin, getDrawables } from './roughShapes';

export interface SceneRenderOptions {
  viewport: Viewport; dpr: number; width: number; height: number; // css px of the target
  background: string | null;   // null = transparent
  grid: boolean;
  hiddenTextId: string | null; // element whose text/label is being edited: not drawn
}

const roughCanvases = new WeakMap<HTMLCanvasElement, RoughCanvas>();

function roughCanvasFor(canvas: HTMLCanvasElement): RoughCanvas {
  let rc = roughCanvases.get(canvas);
  if (!rc) {
    rc = rough.canvas(canvas);
    roughCanvases.set(canvas, rc);
  }
  return rc;
}

interface FontMetrics { asc: number; desc: number }
const metricsCache = new Map<string, FontMetrics>();

/** Forget measured font metrics (call after web fonts finish loading). */
export function clearTextMetricsCache(): void {
  metricsCache.clear();
}

/** Ascent/descent of `font` (ctx.font must already be set to it), cached per font string. */
function fontMetrics(ctx: CanvasRenderingContext2D, font: string, fontSize: number): FontMetrics {
  const hit = metricsCache.get(font);
  if (hit) return hit;
  const m = ctx.measureText('Hg');
  const asc = m.fontBoundingBoxAscent;
  const desc = m.fontBoundingBoxDescent;
  const ok = Number.isFinite(asc) && Number.isFinite(desc);
  const result: FontMetrics = ok ? { asc, desc } : { asc: 0.8 * fontSize, desc: 0.2 * fontSize };
  metricsCache.set(font, result);
  return result;
}

/**
 * Draws a laid-out text block. Each line is positioned like a CSS line box of height `lineHeight`
 * (half-leading above and below the font's ascent + descent), so text does not jump when the
 * textarea editor opens or closes.
 */
export function drawTextLayout(ctx: CanvasRenderingContext2D, layout: TextLayout, color: string): void {
  ctx.font = layout.font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = layout.align;
  const x = layout.align === 'left' ? layout.x : layout.align === 'center' ? layout.x + layout.width / 2 : layout.x + layout.width;
  const { asc, desc } = fontMetrics(ctx, layout.font, layout.fontSize);
  for (let i = 0; i < layout.lines.length; i++) {
    const line = layout.lines[i]!;
    if (line === '') continue;
    const lineTop = layout.y + i * layout.lineHeight;
    const baseline = lineTop + (layout.lineHeight - (asc + desc)) / 2 + asc;
    ctx.fillText(line, x, baseline);
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, o: SceneRenderOptions): void {
  const zoom = o.viewport.zoom;
  let step = GRID_SIZE;
  while (step * zoom < GRID_MIN_SPACING_PX) step *= 5;
  ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
  ctx.fillStyle = GRID_COLOR;
  const vis = visibleWorldRect(o.viewport, { width: o.width, height: o.height });
  const x0 = Math.ceil(vis.x / step) * step;
  const y0 = Math.ceil(vis.y / step) * step;
  for (let wx = x0; wx <= vis.x + vis.width; wx += step) {
    const sx = Math.round((wx + o.viewport.scrollX) * zoom);
    for (let wy = y0; wy <= vis.y + vis.height; wy += step) {
      const sy = Math.round((wy + o.viewport.scrollY) * zoom);
      ctx.fillRect(sx - 1, sy - 1, GRID_DOT_PX, GRID_DOT_PX);
    }
  }
}

function drawElement(ctx: CanvasRenderingContext2D, rc: RoughCanvas, el: ChalkElement, o: SceneRenderOptions): void {
  const alpha = Math.min(1, Math.max(0, el.style.opacity / 100));
  ctx.save();
  try {
    ctx.globalAlpha = alpha;
    if (el.type !== 'text') {
      const origin = drawOrigin(el);
      ctx.translate(origin.x, origin.y);
      for (const d of getDrawables(el)) rc.draw(d);
      ctx.translate(-origin.x, -origin.y);
    }
    if (el.id !== o.hiddenTextId) {
      const layout = layoutText(el);
      if (layout) {
        if (el.type === 'arrow') {
          // The label sits on an opaque patch so the arrow body does not run through the text.
          const box = expandRect({ x: layout.x, y: layout.y, width: layout.width, height: layout.height }, ARROW_LABEL_BG_PAD);
          ctx.globalAlpha = 1;
          ctx.fillStyle = o.background ?? CANVAS_BACKGROUND;
          ctx.fillRect(box.x, box.y, box.width, box.height);
          ctx.globalAlpha = alpha;
        }
        drawTextLayout(ctx, layout, el.style.strokeColor);
      }
    }
  } finally {
    ctx.restore();
  }
}

/** Draws the whole scene (background, grid, visible elements) onto `ctx`. Safe to call every frame. */
export function drawScene(ctx: CanvasRenderingContext2D, elements: readonly ChalkElement[], o: SceneRenderOptions): void {
  const canvas = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (o.background === null) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = o.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (o.grid) drawGrid(ctx, o);

  const { scrollX, scrollY, zoom } = o.viewport;
  ctx.setTransform(o.dpr * zoom, 0, 0, o.dpr * zoom, o.dpr * zoom * scrollX, o.dpr * zoom * scrollY);
  const visible = expandRect(visibleWorldRect(o.viewport, { width: o.width, height: o.height }), CULL_MARGIN_PX / zoom);
  const rc = roughCanvasFor(canvas);
  for (const el of elements) {
    try {
      if (!rectsIntersect(getBounds(el), visible)) continue;
      drawElement(ctx, rc, el, o);
    } catch (err) {
      console.error('drawScene: failed to draw element', el.id, err);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
