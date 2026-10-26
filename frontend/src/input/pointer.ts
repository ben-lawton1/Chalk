// Pointer router: canvas pointer events -> tools, wheel pan/zoom, Space-pan and cursor sync (WP3).
// v3: touch goes to input/touch.ts, pen buttons pick the eraser or lasso, and a finger resting next to the pen is ignored.
import type { Point, PointerInfo, Tool } from '../types';
import { PALM_GRACE_MS, TOUCH_TAP_SLOP_PX, WHEEL_LINE_PX, WHEEL_ZOOM_MAX_DELTA, WHEEL_ZOOM_SPEED } from '../constants';
import { clamp } from '../core/math';
import { panBy, screenToWorld, zoomAt } from '../core/viewport';
import { TOOLS } from '../tools';
import { handTool } from '../tools/hand';
import { eraserTool } from '../tools/eraser';
import { lassoTool } from '../tools/lasso';
import { penTool } from '../tools/pen';
import { isOverSelection, selectTool } from '../tools/select';
import { getState, setInteraction, setLastPointerWorld, setSelection, setViewport, subscribe } from '../state/store';
import { commitEditing } from '../state/actions';
import { classifyPen, ERASER_CURSOR } from './penButtons';
import { createTapTracker } from './taps';
import { touchGestures } from './touch';

const NON_TEXT_INPUT_TYPES = ['range', 'color', 'checkbox', 'radio', 'button', 'submit', 'reset', 'file'];

/** True for elements that take typed text (duck-typed so node tests can pass plain objects). */
export function isTextEntry(t: EventTarget | null): boolean {
  const el = t as unknown as { tagName?: unknown; type?: unknown; isContentEditable?: unknown } | null;
  if (!el || typeof el.tagName !== 'string') return false;
  if (el.isContentEditable === true) return true;
  const tag = el.tagName.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  return !NON_TEXT_INPUT_TYPES.includes(typeof el.type === 'string' ? el.type.toLowerCase() : 'text');
}

let attachedCanvas: HTMLCanvasElement | null = null;
let route: Tool | null = null;
let routePointerId: number | null = null;
let spaceHeld = false;
let detachCurrent: (() => void) | null = null;
let updateCursorFn: (() => void) | null = null;
/** True when the current route was started by a pen tip (so a quick tap can count towards a double tap). */
let routeIsPenTip = false;
let routeDownScreen: Point | null = null;
/** Farthest the route's pointer has been from its down point (screen px). */
let routeMaxMove = 0;
/** Pen proximity, for palm rejection. */
let penInRange = false;
let lastPenAt = -Infinity;
/** Only a mouse double-click is honoured natively; pen and touch double taps are detected by Chalk itself. */
let lastDownPointerType: PointerInfo['pointerType'] = 'mouse';
const penTaps = createTapTracker(() => Date.now());

export function isSpaceHeld(): boolean {
  return spaceHeld;
}

function releaseCapture(canvas: HTMLCanvasElement | null, pointerId: number | null): void {
  if (!canvas || pointerId === null) return;
  try {
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  } catch {
    /* the pointer may already be gone */
  }
}

/** Clears the route, calls its onCancel(), releases capture and ends the gesture (touch gestures too). No-op if none. */
export function cancelGesture(): void {
  touchGestures.cancelAll(false);
  const r = route;
  if (!r) return;
  const pid = routePointerId;
  route = null;
  routePointerId = null;
  routeIsPenTip = false;
  try {
    r.onCancel?.();
  } finally {
    releaseCapture(attachedCanvas, pid);
    setInteraction({ gestureActive: false });
    updateCursorFn?.();
  }
}

/** Pan / zoom from a wheel event. Used by the canvas and by the text editor. */
export function handleWheel(e: WheelEvent): void {
  e.preventDefault();
  const canvas = attachedCanvas;
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  const screen = { x: e.clientX - r.left, y: e.clientY - r.top };
  let dx = e.deltaX;
  let dy = e.deltaY;
  if (e.deltaMode === 1) {
    dx *= WHEEL_LINE_PX;
    dy *= WHEEL_LINE_PX;
  }
  const v = getState().viewport;
  if (e.ctrlKey || e.metaKey) {
    const d = clamp(dy, -WHEEL_ZOOM_MAX_DELTA, WHEEL_ZOOM_MAX_DELTA);
    setViewport(zoomAt(v, v.zoom * Math.exp(-d * WHEEL_ZOOM_SPEED), screen));
  } else {
    if (e.shiftKey && dx === 0) {
      dx = dy;
      dy = 0;
    }
    setViewport(panBy(v, -dx, -dy));
  }
}

function buildInfo(canvas: HTMLCanvasElement, e: MouseEvent): PointerInfo {
  const rect = canvas.getBoundingClientRect();
  const v = getState().viewport;
  const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const pe = e as Partial<PointerEvent>;
  const pointerType = pe.pointerType === 'pen' || pe.pointerType === 'touch' ? pe.pointerType : 'mouse';
  const pressure = typeof pe.pressure === 'number' ? pe.pressure : 0.5;
  // Every sample the browser coalesced into this event (pens report far more often than frames), else the event itself.
  const coalesced = typeof pe.getCoalescedEvents === 'function' ? pe.getCoalescedEvents() : [];
  const samples = (coalesced.length > 0 ? coalesced : [e as PointerEvent]).map((c) => ({
    world: screenToWorld({ x: c.clientX - rect.left, y: c.clientY - rect.top }, v),
    pressure: typeof c.pressure === 'number' ? c.pressure : pressure,
  }));
  return {
    world: screenToWorld(screen, v),
    screen,
    shift: e.shiftKey,
    alt: e.altKey,
    mod: e.ctrlKey || e.metaKey,
    button: e.button,
    buttons: e.buttons,
    pointerType,
    pressure,
    samples,
  };
}

/** The pointerup path (§9.1): clears the route first so the lostpointercapture it triggers is a no-op. */
function runPointerUp(canvas: HTMLCanvasElement, e: PointerEvent): void {
  const r = route;
  if (!r) return;
  const penTip = routeIsPenTip;
  const moved = routeMaxMove;
  const down = routeDownScreen;
  route = null;
  routePointerId = null;
  routeIsPenTip = false;
  try {
    const info = buildInfo(canvas, e);
    r.onPointerUp(info);
    // A pen double tap (the browser's dblclick is ignored for pens): two quick taps that barely moved.
    if (penTip && down && Math.max(moved, Math.hypot(info.screen.x - down.x, info.screen.y - down.y)) <= TOUCH_TAP_SLOP_PX) {
      if (penTaps.tap(info.screen)) r.onDoubleClick?.(info);
    } else if (penTip) {
      penTaps.reset();
    }
  } finally {
    releaseCapture(canvas, e.pointerId);
    setInteraction({ gestureActive: false });
    updateCursorFn?.();
  }
}

export function attachPointerInput(canvas: HTMLCanvasElement): () => void {
  if (detachCurrent) detachCurrent();
  attachedCanvas = canvas;

  function computeCursor(): string {
    const s = getState();
    if (route !== null && route === handTool) return 'grabbing';
    if (spaceHeld) return 'grab';
    return s.interaction.cursor ?? TOOLS[s.tool].cursor;
  }
  function updateCursor(): void {
    const c = computeCursor();
    if (canvas.style.cursor !== c) canvas.style.cursor = c;
  }
  updateCursorFn = updateCursor;

  const onMouseDown = (e: MouseEvent): void => e.preventDefault();
  const onContextMenu = (e: MouseEvent): void => e.preventDefault();

  const onPointerDown = (e: PointerEvent): void => {
    // 0. Blur whatever else has focus (the mousedown preventDefault would leave it focused).
    const ae = document.activeElement;
    if (ae instanceof HTMLElement && ae !== document.body && ae.getAttribute('data-testid') !== 'text-editor') ae.blur();
    const now = Date.now();
    lastDownPointerType = e.pointerType === 'pen' || e.pointerType === 'touch' ? e.pointerType : 'mouse';
    // 0b. A finger: the touch state machine (it never draws). Ignored while a pen is at work or hovering (palm rejection).
    if (e.pointerType === 'touch') {
      if (route !== null || penInRange || now - lastPenAt < PALM_GRACE_MS) return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic or already-ended pointers cannot be captured */
      }
      touchGestures.down(e.pointerId, buildInfo(canvas, e));
      return;
    }
    // 0c. The pen arrived: whatever the touch state machine is doing was a palm. Put the view back.
    if (e.pointerType === 'pen') {
      penInRange = true;
      lastPenAt = now;
      touchGestures.cancelAll(true);
    }
    // 1. A gesture is active: recover a lost pointerup of the same pointer, ignore any other pointer.
    if (route !== null) {
      if (e.pointerId === routePointerId) runPointerUp(canvas, e);
      else return;
    }
    // 2. A click while editing only finishes the editing.
    if (getState().editing) {
      commitEditing();
      return;
    }
    // 3. Choose the route. The pen's eraser and barrel buttons are told apart by the signal the browser reports.
    const s = getState();
    const tool = s.tool;
    const penAction = e.pointerType === 'pen' ? classifyPen(e.button, e.buttons, s.penButtonsSwapped) : 'tip';
    const info = buildInfo(canvas, e);
    let chosen: Tool;
    let penTip = false;
    if (penAction === 'erase') chosen = eraserTool;
    else if (penAction === 'lasso') chosen = lassoTool;
    else if (e.button === 1 || spaceHeld || tool === 'hand') chosen = handTool;
    else if (e.button === 0) {
      chosen = TOOLS[tool];
      if (tool === 'pen' || tool === 'eraser' || tool === 'lasso') {
        // OneNote behaviour: on the current selection the tip moves or resizes it; anywhere else it starts over.
        if (s.selectedIds.length > 0 && isOverSelection(info)) chosen = selectTool;
        else if (s.selectedIds.length > 0) setSelection([]);
      }
      penTip = e.pointerType === 'pen';
    } else return;
    // 4. Start the gesture.
    route = chosen;
    routePointerId = e.pointerId;
    routeIsPenTip = penTip;
    routeDownScreen = info.screen;
    routeMaxMove = 0;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-ended pointers cannot be captured */
    }
    setInteraction({ gestureActive: true });
    updateCursor();
    try {
      chosen.onPointerDown(info);
    } catch (err) {
      console.error(err);
      cancelGesture();
    }
  };

  const onPointerMove = (e: PointerEvent): void => {
    const info = buildInfo(canvas, e);
    setLastPointerWorld(info.world);
    if (e.pointerType === 'touch') {
      touchGestures.move(e.pointerId, info);
      return;
    }
    if (e.pointerType === 'pen') {
      penInRange = true;
      lastPenAt = Date.now();
    }
    if (route !== null) {
      if (e.pointerId !== routePointerId) return;
      // Left, right, middle and the pen's eraser button all keep a gesture alive (buttons bits 1, 2, 4 and 32).
      if ((e.buttons & (1 | 2 | 4 | 32)) === 0) runPointerUp(canvas, e);
      else {
        if (routeDownScreen) routeMaxMove = Math.max(routeMaxMove, Math.hypot(info.screen.x - routeDownScreen.x, info.screen.y - routeDownScreen.y));
        route.onPointerMove(info);
      }
      return;
    }
    TOOLS[getState().tool].onPointerMove(info);
    if (e.pointerType === 'pen') {
      // Hovering with a pen button held: show the mode before touching down.
      const action = classifyPen(e.button, e.buttons, getState().penButtonsSwapped);
      if (action === 'erase') setInteraction({ cursor: ERASER_CURSOR });
      else if (action === 'lasso') setInteraction({ cursor: 'crosshair' });
    }
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      touchGestures.up(e.pointerId, buildInfo(canvas, e));
      releaseCapture(canvas, e.pointerId);
      return;
    }
    if (route !== null && e.pointerId === routePointerId) runPointerUp(canvas, e);
  };
  const onPointerCancel = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      touchGestures.cancel(e.pointerId);
      releaseCapture(canvas, e.pointerId);
      return;
    }
    if (route !== null && e.pointerId === routePointerId) cancelGesture();
  };
  const onLostCapture = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      if (touchGestures.isTracking(e.pointerId)) touchGestures.cancel(e.pointerId);
      return;
    }
    if (route !== null && e.pointerId === routePointerId) cancelGesture();
  };
  const onPointerOver = (e: PointerEvent): void => {
    if (e.pointerType === 'pen') {
      penInRange = true;
      lastPenAt = Date.now();
    }
  };
  const onPointerLeave = (e: PointerEvent): void => {
    if (e.pointerType === 'pen') penInRange = false;
    if (route === null) setInteraction({ hoverId: null, bindTarget: null, cursor: null, eraser: null });
  };
  const onDoubleClick = (e: MouseEvent): void => {
    // Pen and touch double taps are detected by Chalk itself; honouring this too would fire twice.
    if (lastDownPointerType !== 'mouse') return;
    TOOLS[getState().tool].onDoubleClick?.(buildInfo(canvas, e));
  };
  const onCanvasWheel = (e: WheelEvent): void => handleWheel(e);

  const onWindowWheel = (e: WheelEvent): void => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'Space') return;
    if (isTextEntry(e.target) || getState().editing) return;
    e.preventDefault();
    if (!e.repeat) {
      spaceHeld = true;
      updateCursor();
    }
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.code !== 'Space') return;
    // Always release: a key-up swallowed because editing began mid-press must not leave Space stuck.
    spaceHeld = false;
    updateCursor();
  };
  const onBlur = (): void => {
    spaceHeld = false;
    cancelGesture();
    updateCursor();
  };

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('lostpointercapture', onLostCapture);
  canvas.addEventListener('pointerover', onPointerOver);
  canvas.addEventListener('pointerout', onPointerLeave);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('dblclick', onDoubleClick);
  canvas.addEventListener('wheel', onCanvasWheel, { passive: false });
  window.addEventListener('wheel', onWindowWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  const unsubscribe = subscribe(updateCursor);
  updateCursor();

  let detached = false;
  const detach = (): void => {
    if (detached) return;
    detached = true;
    cancelGesture();
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('contextmenu', onContextMenu);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
    canvas.removeEventListener('lostpointercapture', onLostCapture);
    canvas.removeEventListener('pointerover', onPointerOver);
    canvas.removeEventListener('pointerout', onPointerLeave);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('dblclick', onDoubleClick);
    canvas.removeEventListener('wheel', onCanvasWheel);
    window.removeEventListener('wheel', onWindowWheel);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    unsubscribe();
    spaceHeld = false;
    penInRange = false;
    lastPenAt = -Infinity;
    lastDownPointerType = 'mouse';
    penTaps.reset();
    if (attachedCanvas === canvas) attachedCanvas = null;
    if (detachCurrent === detach) detachCurrent = null;
    if (updateCursorFn === updateCursor) updateCursorFn = null;
  };
  detachCurrent = detach;
  return detach;
}
