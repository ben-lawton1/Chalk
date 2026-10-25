// Pointer router: canvas pointer events -> tools, wheel pan/zoom, Space-pan and cursor sync (WP3).
import type { PointerInfo, Tool } from '../types';
import { WHEEL_LINE_PX, WHEEL_ZOOM_MAX_DELTA, WHEEL_ZOOM_SPEED } from '../constants';
import { clamp } from '../core/math';
import { panBy, screenToWorld, zoomAt } from '../core/viewport';
import { TOOLS } from '../tools';
import { handTool } from '../tools/hand';
import { getState, setInteraction, setLastPointerWorld, setViewport, subscribe } from '../state/store';
import { commitEditing } from '../state/actions';

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

/** Clears the route, calls its onCancel(), releases capture and ends the gesture. No-op if none. */
export function cancelGesture(): void {
  const r = route;
  if (!r) return;
  const pid = routePointerId;
  route = null;
  routePointerId = null;
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
  const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  return {
    world: screenToWorld(screen, getState().viewport),
    screen,
    shift: e.shiftKey,
    alt: e.altKey,
    mod: e.ctrlKey || e.metaKey,
    button: e.button,
    buttons: e.buttons,
  };
}

/** The pointerup path (§9.1): clears the route first so the lostpointercapture it triggers is a no-op. */
function runPointerUp(canvas: HTMLCanvasElement, e: PointerEvent): void {
  const r = route;
  if (!r) return;
  route = null;
  routePointerId = null;
  try {
    r.onPointerUp(buildInfo(canvas, e));
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
    // 3. Choose the route.
    const tool = getState().tool;
    let chosen: Tool;
    if (e.button === 1 || spaceHeld || tool === 'hand') chosen = handTool;
    else if (e.button === 0) chosen = TOOLS[tool];
    else return;
    // 4. Start the gesture.
    route = chosen;
    routePointerId = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-ended pointers cannot be captured */
    }
    setInteraction({ gestureActive: true });
    updateCursor();
    try {
      chosen.onPointerDown(buildInfo(canvas, e));
    } catch (err) {
      console.error(err);
      cancelGesture();
    }
  };

  const onPointerMove = (e: PointerEvent): void => {
    const info = buildInfo(canvas, e);
    setLastPointerWorld(info.world);
    if (route !== null) {
      if (e.pointerId !== routePointerId) return;
      if ((e.buttons & 7) === 0) runPointerUp(canvas, e);
      else route.onPointerMove(info);
      return;
    }
    TOOLS[getState().tool].onPointerMove(info);
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (route !== null && e.pointerId === routePointerId) runPointerUp(canvas, e);
  };
  const onPointerCancel = (e: PointerEvent): void => {
    if (route !== null && e.pointerId === routePointerId) cancelGesture();
  };
  const onLostCapture = (e: PointerEvent): void => {
    if (route !== null && e.pointerId === routePointerId) cancelGesture();
  };
  const onPointerLeave = (): void => {
    if (route === null) setInteraction({ hoverId: null, bindTarget: null, cursor: null });
  };
  const onDoubleClick = (e: MouseEvent): void => {
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
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('dblclick', onDoubleClick);
    canvas.removeEventListener('wheel', onCanvasWheel);
    window.removeEventListener('wheel', onWindowWheel);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    unsubscribe();
    spaceHeld = false;
    if (attachedCanvas === canvas) attachedCanvas = null;
    if (detachCurrent === detach) detachCurrent = null;
    if (updateCursorFn === updateCursor) updateCursorFn = null;
  };
  detachCurrent = detach;
  return detach;
}
