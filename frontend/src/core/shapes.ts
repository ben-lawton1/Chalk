// SHAPES registry: outline, label box and icon per shape kind; the "add a shape" seam (WP0).
import type { Rect, ShapeDef, ShapeKind } from '../types';
import { LABEL_PADDING } from '../constants';

/** Toolbar order. */
export const SHAPE_KINDS: readonly ShapeKind[] = ['rectangle', 'diamond', 'ellipse', 'triangle'];

/** Shrinks r by d on every side, keeping the center; width/height never below 1. */
export function insetRect(r: Rect, d: number): Rect {
  const w = Math.max(1, r.width - 2 * d);
  const h = Math.max(1, r.height - 2 * d);
  return { x: r.x + (r.width - w) / 2, y: r.y + (r.height - h) / 2, width: w, height: h };
}
export function cornerRadius(r: Rect): number {
  return Math.min(32, 0.25 * Math.min(r.width, r.height));
}
/** SVG path of a rounded rectangle in the coordinates of r. */
export function roundedRectPath(r: Rect, radius: number): string {
  const { x, y, width: w, height: h } = r;
  const k = Math.max(0, Math.min(radius, w / 2, h / 2));
  return `M ${x + k} ${y} L ${x + w - k} ${y} Q ${x + w} ${y} ${x + w} ${y + k} L ${x + w} ${y + h - k} Q ${x + w} ${y + h} ${x + w - k} ${y + h} L ${x + k} ${y + h} Q ${x} ${y + h} ${x} ${y + h - k} L ${x} ${y + k} Q ${x} ${y} ${x + k} ${y} Z`;
}
function centered(r: Rect, fw: number, fh: number): Rect {
  const w = r.width * fw;
  const h = r.height * fh;
  return { x: r.x + (r.width - w) / 2, y: r.y + (r.height - h) / 2, width: w, height: h };
}

export const SHAPES: Record<ShapeKind, ShapeDef> = {
  rectangle: {
    kind: 'rectangle', title: 'Rectangle', shortcuts: ['r', '2'], defaultSize: { width: 160, height: 100 },
    outline: (r) => ({ kind: 'polygon', points: [
      { x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height } ] }),
    labelBox: (r) => insetRect(r, LABEL_PADDING),
    path: (r, style) => (style.edges === 'round' ? roundedRectPath(r, cornerRadius(r)) : null),
    icon: 'M4 6h16v12H4z',
  },
  diamond: {
    kind: 'diamond', title: 'Diamond', shortcuts: ['d', '3'], defaultSize: { width: 160, height: 120 },
    outline: (r) => ({ kind: 'polygon', points: [
      { x: r.x + r.width / 2, y: r.y }, { x: r.x + r.width, y: r.y + r.height / 2 },
      { x: r.x + r.width / 2, y: r.y + r.height }, { x: r.x, y: r.y + r.height / 2 } ] }),
    labelBox: (r) => insetRect(centered(r, 0.5, 0.5), LABEL_PADDING / 2),
    icon: 'M12 3l9 9-9 9-9-9z',
  },
  ellipse: {
    kind: 'ellipse', title: 'Ellipse', shortcuts: ['o', '4'], defaultSize: { width: 160, height: 100 },
    outline: (r) => ({ kind: 'ellipse', cx: r.x + r.width / 2, cy: r.y + r.height / 2, rx: r.width / 2, ry: r.height / 2 }),
    labelBox: (r) => insetRect(centered(r, Math.SQRT1_2, Math.SQRT1_2), LABEL_PADDING / 2),
    icon: 'M12 6c4.97 0 9 2.69 9 6s-4.03 6-9 6-9-2.69-9-6 4.03-6 9-6z',
  },
  triangle: {
    kind: 'triangle', title: 'Triangle', shortcuts: ['5'], defaultSize: { width: 140, height: 120 },
    outline: (r) => ({ kind: 'polygon', points: [
      { x: r.x + r.width / 2, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height } ] }),
    labelBox: (r) => insetRect({ x: r.x + r.width / 4, y: r.y + r.height / 2, width: r.width / 2, height: r.height / 2 }, LABEL_PADDING / 2),
    icon: 'M12 4l9 16H3z',
  },
};

export function isShapeKind(v: unknown): v is ShapeKind {
  return typeof v === 'string' && (SHAPE_KINDS as readonly string[]).includes(v);
}
