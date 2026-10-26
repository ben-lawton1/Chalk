// Touch gestures: one finger pans (or moves the selection), two fingers pinch-zoom, a tap selects, a double tap edits (v3).
// A finger never draws. The state machine takes PointerInfos and has an injectable clock, so it runs in node tests.
import type { Point, PointerInfo, Viewport } from '../types';
import { TOUCH_HIT_TOLERANCE_PX, TOUCH_TAP_MAX_MS, TOUCH_TAP_SLOP_PX } from '../constants';
import { hitTest } from '../core/geometry';
import { panBy, pinchViewport } from '../core/viewport';
import { selectTool, isOverSelection } from '../tools/select';
import { getState, setInteraction, setSelection, setViewport } from '../state/store';
import { commitEditing, createTextAt, startEditing } from '../state/actions';
import { createTapTracker } from './taps';

/**
 * idle: no finger. pending: one finger down, not yet moved (a tap if it lifts soon). pan, select-drag, pinch: as named.
 * done: ignore everything until every finger is up (a finger lifted out of a pinch, a tap that only closed the editor).
 */
export type TouchMode = 'idle' | 'pending' | 'pan' | 'select-drag' | 'pinch' | 'done';

interface Finger { start: Point; cur: Point; at: number }

export interface TouchGestures {
  down(id: number, info: PointerInfo): void;
  move(id: number, info: PointerInfo): void;
  up(id: number, info: PointerInfo): void;
  /** pointercancel of one finger: the gesture ends, the viewport stays. */
  cancel(id: number): void;
  /** Ends whatever is going on. `revert` puts the viewport back to where the gesture began (a palm, not a hand). */
  cancelAll(revert: boolean): void;
  mode(): TouchMode;
  isTracking(id: number): boolean;
}

export function createTouchGestures(now: () => number = Date.now): TouchGestures {
  let mode: TouchMode = 'idle';
  const fingers = new Map<number, Finger>();
  /** Viewport when the first finger went down (revert target). */
  let originViewport: Viewport | null = null;
  /** Viewport the current pan or pinch is measured from. */
  let gestureViewport: Viewport | null = null;
  let pinchIds: [number, number] | null = null;
  let pinchStart: { a: Point; b: Point } | null = null;
  const taps = createTapTracker(now);

  function sync(): void {
    setInteraction({ gestureActive: mode !== 'idle' });
  }
  function setMode(m: TouchMode): void {
    mode = m;
    sync();
  }
  function finish(): void {
    fingers.clear();
    originViewport = null;
    gestureViewport = null;
    pinchIds = null;
    pinchStart = null;
    setMode('idle');
  }
  /** Back to idle when the last finger is up, else keep ignoring the rest. */
  function release(id: number): void {
    fingers.delete(id);
    if (fingers.size === 0) finish();
    else setMode('done');
  }

  function tap(info: PointerInfo): void {
    const s = getState();
    const hit = hitTest(s.elements, info.world, s.viewport.zoom, TOUCH_HIT_TOLERANCE_PX); // hollow hits count: fingers are imprecise
    const el = hit?.element ?? null;
    const isDouble = taps.tap(info.screen);
    if (s.tool === 'text' && el?.type !== 'ink') {
      // The text tool keeps working with touch: tap a shape or text to edit it, tap empty canvas to write.
      if (el) startEditing(el.id);
      else createTextAt(info.world);
      return;
    }
    if (isDouble) {
      if (el && el.type !== 'ink') startEditing(el.id);
      else if (el) setSelection([el.id]);
      else createTextAt(info.world);
      return;
    }
    setSelection(el ? [el.id] : []);
  }

  /** Records a tap that the select tool already handled; a double tap on a shape or text edits it. */
  function editOnDoubleTap(info: PointerInfo): void {
    if (!taps.tap(info.screen)) return;
    const s = getState();
    const el = hitTest(s.elements, info.world, s.viewport.zoom, TOUCH_HIT_TOLERANCE_PX)?.element;
    if (el && el.type !== 'ink') startEditing(el.id);
  }

  return {
    down(id, info) {
      if (fingers.has(id)) return;
      if (mode === 'done') {
        fingers.set(id, { start: info.screen, cur: info.screen, at: now() });
        return;
      }
      if (mode === 'idle') {
        originViewport = getState().viewport;
        fingers.set(id, { start: info.screen, cur: info.screen, at: now() });
        if (getState().editing) {
          // A touch while editing only finishes the editing, like a click.
          commitEditing();
          setMode('done');
        } else if (isOverSelection(info)) {
          selectTool.onPointerDown(info);
          setMode('select-drag');
        } else {
          gestureViewport = getState().viewport;
          setMode('pending');
        }
        return;
      }
      if (fingers.size === 1 && (mode === 'pending' || mode === 'pan' || mode === 'select-drag')) {
        const [firstId, first] = [...fingers.entries()][0]!;
        if (mode === 'select-drag') selectTool.onCancel?.();
        fingers.set(id, { start: info.screen, cur: info.screen, at: now() });
        // The pinch is measured from where the fingers are right now, so a pan in progress does not jump.
        gestureViewport = getState().viewport;
        pinchIds = [firstId, id];
        pinchStart = { a: first.cur, b: info.screen };
        setMode('pinch');
        return;
      }
      // A third finger (or a second one while ignoring) does nothing.
    },

    move(id, info) {
      const f = fingers.get(id);
      if (!f) return;
      f.cur = info.screen;
      switch (mode) {
        case 'pending':
          if (Math.hypot(f.cur.x - f.start.x, f.cur.y - f.start.y) > TOUCH_TAP_SLOP_PX) {
            setMode('pan');
            setViewport(panBy(gestureViewport!, f.cur.x - f.start.x, f.cur.y - f.start.y));
          }
          return;
        case 'pan':
          setViewport(panBy(gestureViewport!, f.cur.x - f.start.x, f.cur.y - f.start.y));
          return;
        case 'select-drag':
          selectTool.onPointerMove(info);
          return;
        case 'pinch': {
          if (!pinchIds || !pinchStart || !gestureViewport) return;
          const a = fingers.get(pinchIds[0]);
          const b = fingers.get(pinchIds[1]);
          if (a && b) setViewport(pinchViewport(gestureViewport, pinchStart.a, pinchStart.b, a.cur, b.cur));
          return;
        }
        default:
      }
    },

    up(id, info) {
      const f = fingers.get(id);
      if (!f) return;
      switch (mode) {
        case 'pending':
          if (now() - f.at <= TOUCH_TAP_MAX_MS) tap(info);
          break;
        case 'select-drag': {
          selectTool.onPointerUp(info);
          // The second tap of a double tap lands on the selection the first tap made, so it arrives here, not in 'pending'.
          const stayed = Math.hypot(info.screen.x - f.start.x, info.screen.y - f.start.y) <= TOUCH_TAP_SLOP_PX;
          if (stayed && now() - f.at <= TOUCH_TAP_MAX_MS) editOnDoubleTap(info);
          else taps.reset();
          break;
        }
        default:
      }
      // A finger leaving a pinch ends it ('done'), so the remaining finger does not make the view jump.
      release(id);
    },

    cancel(id) {
      if (!fingers.has(id)) return;
      if (mode === 'select-drag') selectTool.onCancel?.();
      release(id);
    },

    cancelAll(revert) {
      if (mode === 'idle') return;
      if (mode === 'select-drag') selectTool.onCancel?.();
      if (revert && originViewport) setViewport(originViewport);
      finish();
    },

    mode: () => mode,
    isTracking: (id) => fingers.has(id),
  };
}

/** The app's single touch state machine. */
export const touchGestures = createTouchGestures();
