// Viewport transforms: world/screen mapping, zoom, pan and fit (WP0).
import type { Point, Rect, Size, Viewport } from '../types';
import { FIT_MAX_ZOOM, FIT_PADDING_PX, MAX_ZOOM, MIN_ZOOM } from '../constants';

export function worldToScreen(p: Point, v: Viewport): Point {
  return { x: (p.x + v.scrollX) * v.zoom, y: (p.y + v.scrollY) * v.zoom };
}
export function screenToWorld(p: Point, v: Viewport): Point {
  return { x: p.x / v.zoom - v.scrollX, y: p.y / v.zoom - v.scrollY };
}
export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}
/** Keeps the world point under `anchor` (screen) fixed. */
export function zoomAt(v: Viewport, zoom: number, anchor: Point): Viewport {
  const z2 = clampZoom(zoom);
  return { zoom: z2, scrollX: v.scrollX + anchor.x / z2 - anchor.x / v.zoom, scrollY: v.scrollY + anchor.y / z2 - anchor.y / v.zoom };
}
export function panBy(v: Viewport, dxScreen: number, dyScreen: number): Viewport {
  return { ...v, scrollX: v.scrollX + dxScreen / v.zoom, scrollY: v.scrollY + dyScreen / v.zoom };
}
/** null bounds gives the identity viewport {0, 0, 1}. */
export function fitToBounds(bounds: Rect | null, size: Size, opts: { padding?: number; maxZoom?: number } = {}): Viewport {
  if (!bounds) return { scrollX: 0, scrollY: 0, zoom: 1 };
  const padding = opts.padding ?? FIT_PADDING_PX;
  const maxZoom = opts.maxZoom ?? FIT_MAX_ZOOM;
  if (size.width <= 0 || size.height <= 0) return { scrollX: padding - bounds.x, scrollY: padding - bounds.y, zoom: 1 };
  const aw = size.width - 2 * padding > 0 ? size.width - 2 * padding : size.width;
  const ah = size.height - 2 * padding > 0 ? size.height - 2 * padding : size.height;
  const z = clampZoom(Math.min(aw / Math.max(bounds.width, 1), ah / Math.max(bounds.height, 1), maxZoom));
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  return { zoom: z, scrollX: size.width / (2 * z) - cx, scrollY: size.height / (2 * z) - cy };
}
export function visibleWorldRect(v: Viewport, size: Size): Rect {
  return { x: -v.scrollX, y: -v.scrollY, width: size.width / v.zoom, height: size.height / v.zoom };
}
export function viewportCenter(size: Size): Point {
  return { x: size.width / 2, y: size.height / 2 };
}
