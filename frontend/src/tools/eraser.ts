// Eraser tool: removes whole elements that the eraser ring passes over; one undo entry per drag (v3).
import type { ChalkElement, Point, PointerInfo, Snapshot, Tool } from '../types';
import { ERASER_RADIUS_PX } from '../constants';
import { hitTestElement } from '../core/geometry';
import { segmentDistanceToInk } from '../core/ink';
import { removeElements } from '../core/scene';
import { getState, setElements, setInteraction, setSelection } from '../state/store';
import { pushUndo, takeSnapshot } from '../state/history';

let active = false;
let before: Snapshot | null = null;
let last: Point | null = null;

function reset(): void {
  active = false;
  before = null;
  last = null;
}

/** Does the eraser ring, swept from a to b, touch el? Only strong hits count, so the middle of a hollow shape survives. */
function touches(el: ChalkElement, a: Point, b: Point, radius: number, zoom: number): boolean {
  if (el.type === 'ink') return segmentDistanceToInk(el, a, b) <= radius + el.style.strokeWidth / 2;
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (radius / 2)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pt = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (hitTestElement(el, pt, zoom, ERASER_RADIUS_PX) === 'strong') return true;
  }
  return false;
}

/** Removes everything the ring touches while moving from a to b (world). */
function sweep(a: Point, b: Point): void {
  const s = getState();
  const zoom = s.viewport.zoom;
  const radius = ERASER_RADIUS_PX / zoom;
  const ids = s.elements.filter((el) => touches(el, a, b, radius, zoom)).map((el) => el.id);
  if (ids.length === 0) return;
  setElements(removeElements(s.elements, ids));
  setSelection(getState().selectedIds.filter((id) => !ids.includes(id)));
}

function step(p: PointerInfo): void {
  for (const sm of p.samples) {
    sweep(last ?? sm.world, sm.world);
    last = sm.world;
  }
  setInteraction({ eraser: p.world });
}

export const eraserTool: Tool = {
  id: 'eraser',
  cursor: 'crosshair',

  onPointerDown(p) {
    active = true;
    before = takeSnapshot();
    last = null;
    step(p);
  },

  onPointerMove(p) {
    if (active) step(p);
    else setInteraction({ cursor: null, eraser: p.world }); // hover: show the ring
  },

  onPointerUp(p) {
    if (!active) return;
    step(p);
    const snap = before;
    reset();
    // The ring stays under a hovering pen only while the eraser is the selected tool (a pen-button erase ends it).
    setInteraction({ eraser: getState().tool === 'eraser' ? p.world : null });
    if (snap) pushUndo(snap);
  },

  onCancel() {
    if (!active) return;
    const snap = before;
    reset();
    if (snap) {
      setElements(snap.elements);
      setSelection(snap.selectedIds);
    }
    setInteraction({ eraser: null });
  },
};
