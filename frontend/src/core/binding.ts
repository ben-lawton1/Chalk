// Arrow binding: target choice, anchors, orbit placement and re-routing (WP1).
import type { ArrowElement, BindableElement, Binding, ChalkElement, Point } from '../types';
import { BIND_DISTANCE_PX, BIND_GAP, MIN_ARROW_LENGTH, PRECISE_BIND_DEPTH_RATIO } from '../constants';
import { add, clamp, dist, len, normalize, pointsNear, scale, sub } from './math';
import { distanceToOutline, getBounds, getOutline, isBindable, isPointInsideOutline, rayExit } from './geometry';

export function indexById(elements: readonly ChalkElement[]): Map<string, ChalkElement> {
  const m = new Map<string, ChalkElement>();
  for (const el of elements) m.set(el.id, el);
  return m;
}

/**
 * The bindable element an arrow end at `p` would attach to: inside its outline or within BIND_DISTANCE_PX of it.
 * The smallest bounds area wins; ties go to the top-most element.
 */
export function findBindTarget(
  elements: readonly ChalkElement[], p: Point, zoom: number, exclude: readonly (string | null | undefined)[] = [],
): BindableElement | null {
  const maxDist = BIND_DISTANCE_PX / zoom;
  let best: BindableElement | null = null;
  let bestArea = Infinity;
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]!;
    if (!isBindable(el) || exclude.includes(el.id)) continue;
    const o = getOutline(el);
    if (!isPointInsideOutline(o, p) && distanceToOutline(o, p) > maxDist) continue;
    const b = getBounds(el);
    const area = b.width * b.height;
    if (area < bestArea) {
      bestArea = area;
      best = el;
    }
  }
  return best;
}

/** [0.5, 0.5] (center-directed) unless p is inside the target and either `precise` or deeper than the depth ratio. */
export function chooseFixedPoint(target: BindableElement, p: Point, precise: boolean): [number, number] {
  const o = getOutline(target);
  const b = getBounds(target);
  if (isPointInsideOutline(o, p) && (precise || distanceToOutline(o, p) > PRECISE_BIND_DEPTH_RATIO * Math.min(b.width, b.height))) {
    return [
      b.width > 0 ? clamp((p.x - b.x) / b.width, 0, 1) : 0.5,
      b.height > 0 ? clamp((p.y - b.y) / b.height, 0, 1) : 0.5,
    ];
  }
  return [0.5, 0.5];
}

/** (x + w*fx, y + h*fy) of the target's bounds. */
export function focusPoint(target: BindableElement, b: Binding): Point {
  const r = getBounds(target);
  return { x: r.x + r.width * b.fixedPoint[0], y: r.y + r.height * b.fixedPoint[1] };
}

function bindTargetOf(b: Binding | null, byId: ReadonlyMap<string, ChalkElement>): BindableElement | null {
  if (!b) return null;
  const t = byId.get(b.elementId);
  return t && isBindable(t) ? t : null;
}

/** Where an arrow end touches `t`: along the ray from its focus toward the other end's reference, plus the gap. */
function attach(t: BindableElement, focus: Point, otherRef: Point, otherTarget: BindableElement | null): Point {
  const o = getOutline(t);
  if (isPointInsideOutline(o, otherRef)) return focus;
  const d = sub(otherRef, focus);
  if (len(d) < 1e-6) return focus;
  const hit = rayExit(o, focus, d);
  if (!hit) return focus;
  const p = add(hit, scale(normalize(d), BIND_GAP + t.style.strokeWidth / 2));
  return otherTarget && isPointInsideOutline(getOutline(otherTarget), p) ? focus : p;
}

/** Re-derives the drawn endpoints of a bound arrow. Returns the same object when nothing moves. */
export function resolveArrow(a: ArrowElement, byId: ReadonlyMap<string, ChalkElement>): ArrowElement {
  const s = bindTargetOf(a.startBinding, byId);
  const e = bindTargetOf(a.endBinding, byId);
  if (!s && !e) return a;
  const sRef = s ? focusPoint(s, a.startBinding!) : a.start;
  const eRef = e ? focusPoint(e, a.endBinding!) : a.end;
  let start = s ? attach(s, sRef, eRef, e) : a.start;
  let end = e ? attach(e, eRef, sRef, s) : a.end;
  if (s && e && dist(start, end) < MIN_ARROW_LENGTH) {
    start = sRef;
    end = eRef;
  }
  return pointsNear(start, a.start) && pointsNear(end, a.end) ? a : { ...a, start, end };
}

/** Re-resolves arrows that are in `changedIds` or bound to an id in it (null = all). Returns the input array if nothing changed. */
export function updateBoundArrows(elements: readonly ChalkElement[], changedIds: ReadonlySet<string> | null): readonly ChalkElement[] {
  const byId = indexById(elements);
  let out: ChalkElement[] | null = null;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]!;
    if (el.type !== 'arrow') continue;
    if (!el.startBinding && !el.endBinding) continue;
    if (
      changedIds !== null && !changedIds.has(el.id) &&
      !(el.startBinding && changedIds.has(el.startBinding.elementId)) &&
      !(el.endBinding && changedIds.has(el.endBinding.elementId))
    ) continue;
    const next = resolveArrow(el, byId);
    if (next !== el) {
      if (!out) out = elements.slice();
      out[i] = next;
    }
  }
  return out ?? elements;
}

export function arrowsBoundTo(elements: readonly ChalkElement[], id: string): ArrowElement[] {
  const out: ArrowElement[] = [];
  for (const el of elements) {
    if (el.type === 'arrow' && (el.startBinding?.elementId === id || el.endBinding?.elementId === id)) out.push(el);
  }
  return out;
}

/** Nulls the bindings that point at `ids`; arrow endpoints stay where they are. Returns the input array if unchanged. */
export function unbindFrom(elements: readonly ChalkElement[], ids: ReadonlySet<string>): readonly ChalkElement[] {
  if (ids.size === 0) return elements;
  let out: ChalkElement[] | null = null;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]!;
    if (el.type !== 'arrow') continue;
    const sHit = el.startBinding !== null && ids.has(el.startBinding.elementId);
    const eHit = el.endBinding !== null && ids.has(el.endBinding.elementId);
    if (!sHit && !eHit) continue;
    if (!out) out = elements.slice();
    out[i] = { ...el, startBinding: sHit ? null : el.startBinding, endBinding: eHit ? null : el.endBinding };
  }
  return out ?? elements;
}
