// Text measurement, wrapping and layout shared by the canvas renderer and the editor overlay (WP0).
import type { ChalkElement, FontFamily, ShapeElement, TextElement, TextLayout } from '../types';
import { APPROX_CHAR_WIDTH_EM, ARROW_LABEL_MAX_WIDTH, FONT_STACKS, LINE_HEIGHT, MIN_SHAPE_SIZE, TEXT_CACHE_LIMIT } from '../constants';
import { nearlyEqual } from './math';
import { SHAPES } from './shapes';

/** CSS px width of one line of text in `font`. */
export type Measurer = (text: string, font: string) => number;

/** Deterministic measurer for Node tests: text.length * font size * APPROX_CHAR_WIDTH_EM. */
export function approxMeasure(text: string, font: string): number {
  const size = parseFloat(font);
  return text.length * (Number.isFinite(size) ? size : 16) * APPROX_CHAR_WIDTH_EM;
}

let customMeasurer: Measurer | null = null;
let canvasCtx: CanvasRenderingContext2D | null | undefined;
const cache = new Map<string, number>();

function defaultMeasure(text: string, font: string): number {
  if (canvasCtx === undefined) {
    canvasCtx = null;
    if (typeof document !== 'undefined') {
      try {
        canvasCtx = document.createElement('canvas').getContext('2d');
      } catch {
        canvasCtx = null;
      }
    }
  }
  if (!canvasCtx) return approxMeasure(text, font);
  canvasCtx.font = font;
  return canvasCtx.measureText(text).width;
}

/** null restores the default (canvas when `document` exists, else approx). Clears the cache. */
export function setMeasurer(m: Measurer | null): void {
  customMeasurer = m;
  cache.clear();
}

/** Cached width of one line. */
export function measureLine(text: string, font: string): number {
  const key = `${font}\u0000${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const w = (customMeasurer ?? defaultMeasure)(text, font);
  if (cache.size >= TEXT_CACHE_LIMIT) cache.clear();
  cache.set(key, w);
  return w;
}

export function clearTextCache(): void {
  cache.clear();
}

export function fontString(fontSize: number, family: FontFamily): string {
  return `${fontSize}px ${FONT_STACKS[family]}`;
}

export function lineHeightPx(fontSize: number): number {
  return fontSize * LINE_HEIGHT;
}

/** Wraps `text` to `maxWidth` (null = break only at newlines). Never returns an empty array. */
export function wrapText(text: string, font: string, maxWidth: number | null): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (maxWidth === null) {
      out.push(para);
      continue;
    }
    let line: string | null = null;
    for (const word of para.split(' ')) {
      const candidate: string = line === null ? word : line + ' ' + word;
      if (measureLine(candidate, font) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line !== null) {
        out.push(line);
        line = null;
      }
      if (measureLine(word, font) <= maxWidth) {
        line = word;
        continue;
      }
      let chunk = '';
      for (const ch of word) {
        if (chunk !== '' && measureLine(chunk + ch, font) > maxWidth) {
          out.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
    }
    out.push(line ?? '');
  }
  return out.length ? out : [''];
}

function maxLineWidth(lines: readonly string[], font: string): number {
  let w = 0;
  for (const l of lines) w = Math.max(w, measureLine(l, font));
  return w;
}

/** Layout of a text element, or of a shape/arrow label. null for an empty shape/arrow label. */
export function layoutText(el: ChalkElement): TextLayout | null {
  const fontSize = el.style.fontSize;
  const font = fontString(fontSize, el.style.fontFamily);
  const lh = lineHeightPx(fontSize);
  if (el.type === 'text') {
    const lines = el.autoResize ? el.text.split('\n') : wrapText(el.text, font, el.width);
    const width = el.autoResize ? Math.max(maxLineWidth(lines, font), fontSize * 0.5) : el.width;
    return {
      lines, x: el.x, y: el.y, width, height: lines.length * lh, fontSize, lineHeight: lh, font,
      align: el.style.textAlign, wrap: !el.autoResize,
    };
  }
  if (el.type === 'shape') {
    if (el.label === '') return null;
    const box = SHAPES[el.shape].labelBox({ x: el.x, y: el.y, width: el.width, height: el.height });
    const lines = wrapText(el.label, font, box.width);
    const h = lines.length * lh;
    return {
      lines, x: box.x, y: box.y + (box.height - h) / 2, width: box.width, height: h, fontSize, lineHeight: lh, font,
      align: 'center', wrap: true,
    };
  }
  if (el.label === '') return null;
  const lines = wrapText(el.label, font, ARROW_LABEL_MAX_WIDTH);
  const w = maxLineWidth(lines, font);
  const h = lines.length * lh;
  const mx = (el.start.x + el.end.x) / 2;
  const my = (el.start.y + el.end.y) / 2;
  return {
    lines, x: mx - w / 2, y: my - h / 2, width: w, height: h, fontSize, lineHeight: lh, font,
    align: 'center', wrap: true,
  };
}

/** Like layoutText, but an empty shape/arrow label is laid out as ' ' so it still has a one-line box. */
export function layoutForEditing(el: ChalkElement): TextLayout {
  const l = layoutText(el);
  if (l) return l;
  const filled = { ...el, label: ' ' } as ChalkElement;
  return layoutText(filled)!;
}

/** Text element with width/height derived from its text. Returns the same object when unchanged. */
export function withMeasuredText(el: TextElement): TextElement {
  const l = layoutText(el)!;
  if (nearlyEqual(l.width, el.width) && nearlyEqual(l.height, el.height)) return el;
  return { ...el, width: l.width, height: l.height };
}

/** Minimum shape height that fits its label (MIN_SHAPE_SIZE when there is no label). */
export function requiredShapeHeight(shape: ShapeElement): number {
  if (shape.label === '') return MIN_SHAPE_SIZE;
  const fontSize = shape.style.fontSize;
  const font = fontString(fontSize, shape.style.fontFamily);
  const lh = lineHeightPx(fontSize);
  const rect = { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  const def = SHAPES[shape.shape];
  const box = def.labelBox(rect);
  const lines = wrapText(shape.label, font, box.width);
  const textH = lines.length * lh;
  const h1 = rect.height + 100;
  const h2 = rect.height + 200;
  const b1 = def.labelBox({ ...rect, height: h1 }).height;
  const b2 = def.labelBox({ ...rect, height: h2 }).height;
  const a = (b2 - b1) / 100;
  if (a <= 0) return rect.height;
  return Math.max(MIN_SHAPE_SIZE, h1 + (textH - b1) / a);
}
