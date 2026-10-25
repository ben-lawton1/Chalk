// Scene file parsing, migrations and defensive restore of imported elements (WP1).
import type {
  ArrowElement, Binding, ChalkElement, Point, SceneFile, ShapeElement, Style, TextElement,
} from '../types';
import {
  ARROWHEADS, DEFAULT_STYLE, EDGES, FILL_STYLES, FONT_FAMILIES, MAX_FONT_SIZE, MIN_FONT_SIZE, MIN_SHAPE_SIZE, SCENE_FILE_TYPE,
  SCENE_FILE_VERSION, STROKE_STYLES, TEXT_ALIGNS,
} from '../constants';
import { clamp } from './math';
import { isValidSeed, newId, newSeed } from './ids';
import { isShapeKind } from './shapes';
import { withMeasuredText } from './text';
import { isBindable } from './geometry';
import { indexById, updateBoundArrows } from './binding';

export class SceneParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SceneParseError';
  }
}

/** n -> n + 1 migrations applied by parseSceneFile. Empty in v1. */
export const MIGRATIONS: Record<number, (file: Record<string, unknown>) => Record<string, unknown>> = {};

export function toSceneFile(elements: readonly ChalkElement[]): SceneFile {
  return { type: SCENE_FILE_TYPE, version: SCENE_FILE_VERSION, elements: [...elements] };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validates the envelope, runs migrations, then restores the elements. Throws SceneParseError. */
export function parseSceneFile(input: unknown): ChalkElement[] {
  if (!isPlainObject(input)) throw new SceneParseError('Not a Chalk scene file');
  if (input.type !== SCENE_FILE_TYPE) throw new SceneParseError('Not a Chalk scene file');
  const version = input.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new SceneParseError('Invalid scene file version');
  }
  if (version > SCENE_FILE_VERSION) throw new SceneParseError('This file was made by a newer Chalk');
  let file: Record<string, unknown> = input;
  for (let v = version; v < SCENE_FILE_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    if (migrate) file = { ...migrate(file), version: v + 1 };
  }
  if (!Array.isArray(file.elements)) throw new SceneParseError('Scene file has no elements array');
  return restoreElements(file.elements);
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isColor = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
function oneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

/** DEFAULT_STYLE with every valid field of `raw` copied over; invalid or missing fields keep their defaults. */
export function restoreStyle(raw: unknown): Style {
  const out: Style = { ...DEFAULT_STYLE };
  if (!isPlainObject(raw)) return out;
  if (isColor(raw.strokeColor)) out.strokeColor = raw.strokeColor;
  if (isColor(raw.backgroundColor)) out.backgroundColor = raw.backgroundColor;
  if (oneOf(FILL_STYLES, raw.fillStyle)) out.fillStyle = raw.fillStyle;
  if (isFiniteNumber(raw.strokeWidth) && raw.strokeWidth > 0) out.strokeWidth = raw.strokeWidth;
  if (oneOf(STROKE_STYLES, raw.strokeStyle)) out.strokeStyle = raw.strokeStyle;
  if (isFiniteNumber(raw.roughness) && raw.roughness >= 0 && raw.roughness <= 2) out.roughness = raw.roughness;
  if (isFiniteNumber(raw.opacity) && raw.opacity >= 0 && raw.opacity <= 100) out.opacity = raw.opacity;
  if (oneOf(EDGES, raw.edges)) out.edges = raw.edges;
  if (isFiniteNumber(raw.fontSize)) out.fontSize = clamp(raw.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE);
  if (oneOf(FONT_FAMILIES, raw.fontFamily)) out.fontFamily = raw.fontFamily;
  if (oneOf(TEXT_ALIGNS, raw.textAlign)) out.textAlign = raw.textAlign;
  if (oneOf(ARROWHEADS, raw.startArrowhead)) out.startArrowhead = raw.startArrowhead;
  if (oneOf(ARROWHEADS, raw.endArrowhead)) out.endArrowhead = raw.endArrowhead;
  return out;
}

function restorePoint(raw: unknown): Point | null {
  return isPlainObject(raw) && isFiniteNumber(raw.x) && isFiniteNumber(raw.y) ? { x: raw.x, y: raw.y } : null;
}

function restoreBinding(raw: unknown, bindableIds: ReadonlySet<string>): Binding | null {
  if (!isPlainObject(raw) || typeof raw.elementId !== 'string' || !bindableIds.has(raw.elementId)) return null;
  const fp = raw.fixedPoint;
  if (!Array.isArray(fp) || fp.length !== 2 || !isFiniteNumber(fp[0]) || !isFiniteNumber(fp[1])) return null;
  return { elementId: raw.elementId, fixedPoint: [clamp(fp[0], 0, 1), clamp(fp[1], 0, 1)] };
}

/** Defensive import (spec 5.1): drops what cannot be repaired, fixes what can, and re-resolves bound arrows. */
export function restoreElements(raw: readonly unknown[]): ChalkElement[] {
  const used = new Set<string>();
  const pendingArrows: { index: number; raw: Record<string, unknown> }[] = [];
  const result: ChalkElement[] = [];

  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    const type = item.type;
    if (type !== 'shape' && type !== 'text' && type !== 'arrow') continue;

    let id = typeof item.id === 'string' && item.id !== '' ? item.id : newId();
    while (used.has(id)) id = newId();
    const seed = isValidSeed(item.seed) ? item.seed : newSeed();
    const style = restoreStyle(item.style);

    if (type === 'shape') {
      if (!isFiniteNumber(item.x) || !isFiniteNumber(item.y) || !isFiniteNumber(item.width) || !isFiniteNumber(item.height)) continue;
      const el: ShapeElement = {
        id, seed, type: 'shape', shape: isShapeKind(item.shape) ? item.shape : 'rectangle',
        x: item.x, y: item.y, width: Math.max(item.width, MIN_SHAPE_SIZE), height: Math.max(item.height, MIN_SHAPE_SIZE),
        label: typeof item.label === 'string' ? item.label : '', style,
      };
      used.add(id);
      result.push(el);
    } else if (type === 'text') {
      if (typeof item.text !== 'string' || item.text.trim() === '') continue;
      if (!isFiniteNumber(item.x) || !isFiniteNumber(item.y)) continue;
      let autoResize = typeof item.autoResize === 'boolean' ? item.autoResize : true;
      if (!autoResize && !(isFiniteNumber(item.width) && item.width > 0)) autoResize = true;
      const el: TextElement = withMeasuredText({
        id, seed, type: 'text', x: item.x, y: item.y, width: autoResize ? 0 : (item.width as number), height: 0,
        text: item.text, autoResize, style,
      });
      used.add(id);
      result.push(el);
    } else {
      const start = restorePoint(item.start);
      const end = restorePoint(item.end);
      if (!start || !end) continue;
      const el: ArrowElement = {
        id, seed, type: 'arrow', start, end, startBinding: null, endBinding: null,
        label: typeof item.label === 'string' ? item.label : '', style,
      };
      used.add(id);
      pendingArrows.push({ index: result.length, raw: item });
      result.push(el);
    }
  }

  // Second pass: a binding survives only if it points at a restored bindable element.
  if (pendingArrows.length > 0) {
    const bindableIds = new Set<string>();
    for (const [id, el] of indexById(result)) if (isBindable(el)) bindableIds.add(id);
    for (const { index, raw: item } of pendingArrows) {
      const arrow = result[index] as ArrowElement;
      const startBinding = restoreBinding(item.startBinding, bindableIds);
      let endBinding = restoreBinding(item.endBinding, bindableIds);
      if (startBinding && endBinding && startBinding.elementId === endBinding.elementId) endBinding = null;
      result[index] = { ...arrow, startBinding, endBinding };
    }
  }
  return [...updateBoundArrows(result, null)];
}
