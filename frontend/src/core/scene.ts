// Element creation and pure scene operations (move, resize, duplicate, reorder, style, text) (WP1).
import type {
  ArrowElement, Binding, ChalkElement, EndpointId, HandleId, Point, Rect, ReorderDir, ShapeElement, ShapeKind, Style, TextElement,
} from '../types';
import { MAX_FONT_SIZE, MIN_FONT_SIZE, MIN_SHAPE_SIZE } from '../constants';
import { add, clamp, rectCenter, rectFromPoints, safeDiv, sgn } from './math';
import { newId, newSeed } from './ids';
import { requiredShapeHeight, withMeasuredText } from './text';
import { getCommonBounds, isBindable } from './geometry';
import { indexById, unbindFrom, updateBoundArrows } from './binding';

// ---------------------------------------------------------------------------
// Creation and lookup
// ---------------------------------------------------------------------------

export function createShape(kind: ShapeKind, r: Rect, style: Style): ShapeElement {
  return {
    id: newId(), seed: newSeed(), type: 'shape', shape: kind,
    x: r.x, y: r.y, width: Math.max(r.width, MIN_SHAPE_SIZE), height: Math.max(r.height, MIN_SHAPE_SIZE),
    label: '', style: { ...style },
  };
}

/** `at` is the top-left corner. The text auto-sizes and is measured. */
export function createText(at: Point, text: string, style: Style): TextElement {
  return withMeasuredText({
    id: newId(), seed: newSeed(), type: 'text', x: at.x, y: at.y, width: 0, height: 0, text, autoResize: true, style: { ...style },
  });
}

export function createArrow(start: Point, end: Point, style: Style): ArrowElement {
  return {
    id: newId(), seed: newSeed(), type: 'arrow', start: { ...start }, end: { ...end },
    startBinding: null, endBinding: null, label: '', style: { ...style },
  };
}

export function getElement(elements: readonly ChalkElement[], id: string): ChalkElement | undefined {
  for (const el of elements) if (el.id === id) return el;
  return undefined;
}

/** text.text, or the label of a shape/arrow. */
export function getElementText(el: ChalkElement): string {
  return el.type === 'text' ? el.text : el.label;
}

// ---------------------------------------------------------------------------
// Add / replace / remove
// ---------------------------------------------------------------------------

/** Appends on top. Returns the input array when `els` is empty. */
export function addElements(elements: readonly ChalkElement[], els: readonly ChalkElement[]): readonly ChalkElement[] {
  return els.length === 0 ? elements : [...elements, ...els];
}

/** Replaces by id, keeping the z-position. Returns the input array when the id is missing or the object is identical. */
export function replaceElement(elements: readonly ChalkElement[], el: ChalkElement): readonly ChalkElement[] {
  const i = elements.findIndex((e) => e.id === el.id);
  if (i < 0 || elements[i] === el) return elements;
  const out = elements.slice();
  out[i] = el;
  return out;
}

/** Removes the elements and nulls bindings to them (arrows survive with frozen endpoints). Input array if none removed. */
export function removeElements(elements: readonly ChalkElement[], ids: readonly string[]): readonly ChalkElement[] {
  if (ids.length === 0) return elements;
  const idSet = new Set(ids);
  const removed = new Set<string>();
  const kept: ChalkElement[] = [];
  for (const el of elements) {
    if (idSet.has(el.id)) removed.add(el.id);
    else kept.push(el);
  }
  if (removed.size === 0) return elements;
  return unbindFrom(kept, removed);
}

// ---------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------

/**
 * Translates the elements. A moved arrow keeps a binding only when its target moves too; other bindings are cleared and
 * the endpoint is frozen at its moved position. Arrows bound to moved elements re-route.
 * Returns `base` when nothing moves (no ids, or dx === dy === 0).
 */
export function moveElements(base: readonly ChalkElement[], ids: readonly string[], dx: number, dy: number): readonly ChalkElement[] {
  if (ids.length === 0 || (dx === 0 && dy === 0)) return base;
  const idSet = new Set(ids);
  const keep = (b: Binding | null): Binding | null => (b && idSet.has(b.elementId) ? b : null);
  let changed = false;
  const next = base.map((el): ChalkElement => {
    if (!idSet.has(el.id)) return el;
    changed = true;
    if (el.type === 'arrow') {
      return {
        ...el,
        start: { x: el.start.x + dx, y: el.start.y + dy },
        end: { x: el.end.x + dx, y: el.end.y + dy },
        startBinding: keep(el.startBinding),
        endBinding: keep(el.endBinding),
      };
    }
    return { ...el, x: el.x + dx, y: el.y + dy };
  });
  return changed ? updateBoundArrows(next, idSet) : base;
}

// ---------------------------------------------------------------------------
// Resize (spec section 11)
// ---------------------------------------------------------------------------

/**
 * Resizes the selection by dragging `handle` to `pointer`. Always computed from the gesture-start `base`, so flips work
 * without swapping handles. Shift keeps aspect, Alt resizes about the center.
 */
export function resizeElements(
  base: readonly ChalkElement[], ids: readonly string[], handle: HandleId, pointer: Point, mods: { shift: boolean; alt: boolean },
): readonly ChalkElement[] {
  const idSet = new Set(ids);
  const sel = base.filter((e) => idSet.has(e.id));
  const box = getCommonBounds(sel);
  if (!box) return base;
  const single = sel.length === 1 ? sel[0]! : null;
  const hx = handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0;
  const hy = handle.includes('n') ? -1 : handle.includes('s') ? 1 : 0;
  const isCorner = hx !== 0 && hy !== 0;

  // (A) single text + e/w handle: fixed-width wrapping text box
  if (single && single.type === 'text' && hy === 0) {
    const ax = mods.alt ? box.x + box.width / 2 : hx === 1 ? box.x : box.x + box.width;
    const raw = mods.alt ? 2 * Math.abs(pointer.x - ax) : Math.abs(pointer.x - ax);
    const width = Math.max(raw, single.style.fontSize);
    const x = mods.alt ? ax - width / 2 : pointer.x < ax ? ax - width : ax;
    const el = withMeasuredText({ ...single, x, width, autoResize: false });
    return updateBoundArrows(replaceElement(base, el), new Set([el.id]));
  }

  // (B) everything else
  const keepAspect = mods.shift || (single !== null && single.type === 'text');
  const c = rectCenter(box);
  const ax = mods.alt ? c.x : hx === 1 ? box.x : box.x + box.width;
  const ay = mods.alt ? c.y : hy === 1 ? box.y : box.y + box.height;
  const ox = hx === 1 ? box.x + box.width : box.x;
  const oy = hy === 1 ? box.y + box.height : box.y;
  let sx = hx === 0 ? 1 : safeDiv(pointer.x - ax, ox - ax);
  let sy = hy === 0 ? 1 : safeDiv(pointer.y - ay, oy - ay);
  if (keepAspect) {
    if (isCorner) {
      const s = Math.max(Math.abs(sx), Math.abs(sy));
      sx = sgn(sx) * s;
      sy = sgn(sy) * s;
    } else if (hx !== 0) sy = Math.abs(sx);
    else sx = Math.abs(sy);
  }
  if (box.width > 0) sx = sgn(sx) * Math.max(Math.abs(sx), MIN_SHAPE_SIZE / box.width);
  if (box.height > 0) sy = sgn(sy) * Math.max(Math.abs(sy), MIN_SHAPE_SIZE / box.height);
  if (single && single.type === 'text') {
    const s = Math.max(Math.abs(sx), MIN_FONT_SIZE / single.style.fontSize);
    sx = sgn(sx) * s;
    sy = sgn(sy) * s;
  }
  const AX = hx === 0 ? c.x : ax;
  const AY = hy === 0 ? c.y : ay;
  const mapX = (x: number): number => (hx === 0 && !keepAspect ? x : AX + (x - AX) * sx);
  const mapY = (y: number): number => (hy === 0 && !keepAspect ? y : AY + (y - AY) * sy);
  const fontScale = single ? Math.abs(sx) : isCorner ? Math.sqrt(Math.abs(sx * sy)) : 1;

  const next = base.map((el): ChalkElement => {
    if (!idSet.has(el.id)) return el;
    if (el.type === 'shape') {
      const r = rectFromPoints({ x: mapX(el.x), y: mapY(el.y) }, { x: mapX(el.x + el.width), y: mapY(el.y + el.height) });
      let s: ShapeElement = { ...el, x: r.x, y: r.y, width: Math.max(r.width, MIN_SHAPE_SIZE), height: Math.max(r.height, MIN_SHAPE_SIZE) };
      if (s.label !== '') {
        const need = requiredShapeHeight(s);
        if (s.height < need) s = { ...s, y: hy === -1 && !mods.alt ? s.y + s.height - need : s.y, height: need };
      }
      return s;
    }
    if (el.type === 'text') {
      const r = rectFromPoints({ x: mapX(el.x), y: mapY(el.y) }, { x: mapX(el.x + el.width), y: mapY(el.y + el.height) });
      const fontSize = clamp(el.style.fontSize * fontScale, MIN_FONT_SIZE, MAX_FONT_SIZE);
      const width = el.autoResize ? el.width : Math.max(fontSize, el.width * Math.abs(sx));
      return withMeasuredText({ ...el, x: r.x, y: r.y, width, style: { ...el.style, fontSize } });
    }
    return {
      ...el,
      start: { x: mapX(el.start.x), y: mapY(el.start.y) },
      end: { x: mapX(el.end.x), y: mapY(el.end.y) },
    };
  });
  return updateBoundArrows(next, idSet);
}

/** Rect for a shape being dragged out from `origin` to `p`. Shift makes it square, Alt grows it from the center. */
export function shapeRectFromDrag(origin: Point, p: Point, mods: { shift: boolean; alt: boolean }): Rect {
  let dx = p.x - origin.x;
  let dy = p.y - origin.y;
  if (mods.shift) {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = sgn(dx) * m;
    dy = sgn(dy) * m;
  }
  return mods.alt
    ? { x: origin.x - Math.abs(dx), y: origin.y - Math.abs(dy), width: 2 * Math.abs(dx), height: 2 * Math.abs(dy) }
    : rectFromPoints(origin, { x: origin.x + dx, y: origin.y + dy });
}

// ---------------------------------------------------------------------------
// Duplicate / clone
// ---------------------------------------------------------------------------

/**
 * Copies of `els` with fresh ids and seeds, shifted by `offset`. Bindings between copied elements are remapped to the
 * copies; bindings to anything else are dropped (the endpoint stays). Bound arrows are re-routed.
 */
export function cloneWithNewIds(els: readonly ChalkElement[], offset: Point): ChalkElement[] {
  const idMap = new Map<string, string>();
  for (const el of els) if (!idMap.has(el.id)) idMap.set(el.id, newId());
  const remap = (b: Binding | null): Binding | null => {
    const target = b ? idMap.get(b.elementId) : undefined;
    return b && target ? { elementId: target, fixedPoint: [b.fixedPoint[0], b.fixedPoint[1]] } : null;
  };
  const claimed = new Set<string>();
  const clones = els.map((el): ChalkElement => {
    // The first element with a given source id gets the mapped id; a repeated source id gets its own fresh one.
    const id = claimed.has(el.id) ? newId() : idMap.get(el.id)!;
    claimed.add(el.id);
    const base = { id, seed: newSeed(), style: { ...el.style } };
    if (el.type === 'arrow') {
      return {
        ...el, ...base, start: add(el.start, offset), end: add(el.end, offset),
        startBinding: remap(el.startBinding), endBinding: remap(el.endBinding),
      };
    }
    return { ...el, ...base, x: el.x + offset.x, y: el.y + offset.y };
  });
  return [...updateBoundArrows(clones, null)];
}

/** Appends copies of the selected elements (in z-order) on top. `newIds` follow the same order. */
export function duplicateElements(
  elements: readonly ChalkElement[], ids: readonly string[], offset: Point,
): { elements: readonly ChalkElement[]; newIds: string[] } {
  const idSet = new Set(ids);
  const src = elements.filter((e) => idSet.has(e.id));
  if (src.length === 0) return { elements, newIds: [] };
  const clones = cloneWithNewIds(src, offset);
  return { elements: [...elements, ...clones], newIds: clones.map((c) => c.id) };
}

// ---------------------------------------------------------------------------
// Z-order
// ---------------------------------------------------------------------------

function sameOrder(a: readonly ChalkElement[], b: readonly ChalkElement[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** front/back move the selection to the end/start; forward/backward swap each selected element with its neighbour. */
export function reorderElements(elements: readonly ChalkElement[], ids: readonly string[], dir: ReorderDir): readonly ChalkElement[] {
  const idSet = new Set(ids);
  const isSel = (e: ChalkElement): boolean => idSet.has(e.id);
  let out: ChalkElement[];
  if (dir === 'front' || dir === 'back') {
    const sel = elements.filter(isSel);
    const rest = elements.filter((e) => !isSel(e));
    out = dir === 'front' ? [...rest, ...sel] : [...sel, ...rest];
  } else {
    out = elements.slice();
    if (dir === 'forward') {
      for (let i = out.length - 2; i >= 0; i--) {
        if (isSel(out[i]!) && !isSel(out[i + 1]!)) [out[i], out[i + 1]] = [out[i + 1]!, out[i]!];
      }
    } else {
      for (let i = 1; i < out.length; i++) {
        if (isSel(out[i]!) && !isSel(out[i - 1]!)) [out[i], out[i - 1]] = [out[i - 1]!, out[i]!];
      }
    }
  }
  return sameOrder(out, elements) ? elements : out;
}

// ---------------------------------------------------------------------------
// Style and text
// ---------------------------------------------------------------------------

/** Grows the shape (top fixed) until its label fits. Returns the same object when it already fits. */
export function fitShapeToLabel(el: ShapeElement): ShapeElement {
  const need = requiredShapeHeight(el);
  return need - el.height > 1e-6 ? { ...el, height: need } : el;
}

/** Applies a style patch. Text is re-measured, labelled shapes refit and bound arrows re-routed. Input array if unchanged. */
export function applyStyleToElements(elements: readonly ChalkElement[], ids: readonly string[], patch: Partial<Style>): readonly ChalkElement[] {
  const keys = (Object.keys(patch) as (keyof Style)[]).filter((k) => patch[k] !== undefined);
  if (keys.length === 0 || ids.length === 0) return elements;
  const idSet = new Set(ids);
  const changedIds = new Set<string>();
  const next = elements.map((el): ChalkElement => {
    if (!idSet.has(el.id) || keys.every((k) => el.style[k] === patch[k])) return el;
    const style = { ...el.style, ...patch } as Style;
    changedIds.add(el.id);
    if (el.type === 'text') return withMeasuredText({ ...el, style });
    if (el.type === 'shape') return fitShapeToLabel({ ...el, style });
    return { ...el, style };
  });
  if (changedIds.size === 0) return elements;
  return updateBoundArrows(next, changedIds);
}

/** Sets the text of a text element or the label of a shape/arrow, resizing and re-routing as needed. Input array if unchanged. */
export function setElementText(elements: readonly ChalkElement[], id: string, text: string): readonly ChalkElement[] {
  const el = getElement(elements, id);
  if (!el || getElementText(el) === text) return elements;
  let next: ChalkElement;
  if (el.type === 'text') next = withMeasuredText({ ...el, text });
  else if (el.type === 'shape') next = fitShapeToLabel({ ...el, label: text });
  else next = { ...el, label: text };
  return updateBoundArrows(replaceElement(elements, next), new Set([id]));
}

// ---------------------------------------------------------------------------
// Arrow endpoints
// ---------------------------------------------------------------------------

/**
 * Moves one arrow end to `point` and (re)binds it. A binding is accepted only when its target exists, is bindable, is not
 * the arrow itself and differs from the other end's target; otherwise the end is left free at `point`.
 */
export function setArrowEndpoint(
  elements: readonly ChalkElement[], arrowId: string, which: EndpointId, point: Point, binding: Binding | null,
): readonly ChalkElement[] {
  const a = getElement(elements, arrowId);
  if (!a || a.type !== 'arrow') return elements;
  let accepted: Binding | null = null;
  if (binding && binding.elementId !== arrowId) {
    const target = indexById(elements).get(binding.elementId);
    const other = which === 'start' ? a.endBinding : a.startBinding;
    if (target && isBindable(target) && other?.elementId !== binding.elementId) {
      accepted = {
        elementId: binding.elementId,
        fixedPoint: [clamp(binding.fixedPoint[0], 0, 1), clamp(binding.fixedPoint[1], 0, 1)],
      };
    }
  }
  const p = { x: point.x, y: point.y };
  const next: ArrowElement = which === 'start'
    ? { ...a, start: p, startBinding: accepted }
    : { ...a, end: p, endBinding: accepted };
  return updateBoundArrows(replaceElement(elements, next), new Set([arrowId]));
}
