// Touch in notes mode: a finger drag on the column pans the page, two fingers pinch-zoom, a tap is left to the browser (it places the caret).
import { TOUCH_TAP_SLOP_PX } from '../../constants';
import { panBy, pinchViewport } from '../../core/viewport';
import { getState, setViewport } from '../../state/store';
import type { Point, Viewport } from '../../types';

/** Attaches the gesture handling to the column; `layer` is the stage-sized parent whose top-left is the viewport origin. Returns a detach. */
export function attachNotesTouchPan(column: HTMLElement, layer: HTMLElement): () => void {
  const fingers = new Map<number, { start: Point; cur: Point }>();
  let mode: 'idle' | 'pending' | 'pan' | 'pinch' | 'done' = 'idle';
  let base: Viewport = getState().viewport;
  let pinch: { ids: [number, number]; a: Point; b: Point } | null = null;
  /** After a pan or pinch the browser still sends compatibility mouse events at the lift point; they must not move the caret. */
  let swallowMouse = false;

  const local = (e: PointerEvent): Point => {
    const r = layer.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent): void => {
    swallowMouse = false;
    if (e.pointerType !== 'touch') return;
    swallowMouse = false;
    const p = local(e);
    fingers.set(e.pointerId, { start: p, cur: p });
    if (fingers.size === 1) {
      mode = 'pending';
      base = getState().viewport;
    } else if (fingers.size === 2 && mode !== 'done') {
      const [first, second] = [...fingers.entries()];
      base = getState().viewport;
      pinch = { ids: [first![0], second![0]], a: first![1].cur, b: second![1].cur };
      mode = 'pinch';
      swallowMouse = true;
    }
    if (mode === 'pinch') {
      try {
        column.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic pointers cannot be captured */
      }
    }
  };

  const onMove = (e: PointerEvent): void => {
    const f = fingers.get(e.pointerId);
    if (!f || e.pointerType !== 'touch') return;
    f.cur = local(e);
    if (mode === 'pending' && Math.hypot(f.cur.x - f.start.x, f.cur.y - f.start.y) > TOUCH_TAP_SLOP_PX) {
      mode = 'pan';
      swallowMouse = true;
      try {
        column.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic pointers cannot be captured */
      }
    }
    if (mode === 'pan') {
      setViewport(panBy(base, f.cur.x - f.start.x, f.cur.y - f.start.y));
    } else if (mode === 'pinch' && pinch) {
      const a = fingers.get(pinch.ids[0]);
      const b = fingers.get(pinch.ids[1]);
      if (a && b) setViewport(pinchViewport(base, pinch.a, pinch.b, a.cur, b.cur));
    }
    if (mode === 'pan' || mode === 'pinch') e.preventDefault();
  };

  const onEnd = (e: PointerEvent): void => {
    if (!fingers.has(e.pointerId)) return;
    fingers.delete(e.pointerId);
    if (fingers.size === 0) {
      mode = 'idle';
      pinch = null;
    } else if (mode === 'pinch') {
      mode = 'done'; // the remaining finger must not make the view jump
      pinch = null;
    }
  };

  const onMouse = (e: MouseEvent): void => {
    if (!swallowMouse) return;
    e.preventDefault();
    e.stopPropagation();
  };

  column.addEventListener('pointerdown', onDown, true);
  column.addEventListener('pointermove', onMove, true);
  column.addEventListener('pointerup', onEnd, true);
  column.addEventListener('pointercancel', onEnd, true);
  column.addEventListener('mousedown', onMouse, true);
  column.addEventListener('click', onMouse, true);
  return () => {
    column.removeEventListener('pointerdown', onDown, true);
    column.removeEventListener('pointermove', onMove, true);
    column.removeEventListener('pointerup', onEnd, true);
    column.removeEventListener('pointercancel', onEnd, true);
    column.removeEventListener('mousedown', onMouse, true);
    column.removeEventListener('click', onMouse, true);
  };
}
