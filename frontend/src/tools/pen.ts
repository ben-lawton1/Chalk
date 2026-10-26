// Pen tool: freehand ink. The live stroke is drawn on the overlay only; the scene changes once, on pointer up (v3).
import type { InkElement, InkPoint, PointerInfo, Snapshot, Tool } from '../types';
import { INK_MIN_SAMPLE_PX } from '../constants';
import { addElements } from '../core/scene';
import { createInk, normaliseInk } from '../core/ink';
import { getState, setElements, setInteraction } from '../state/store';
import { pushUndo, takeSnapshot } from '../state/history';

let active = false;
let before: Snapshot | null = null;
let points: InkPoint[] = [];
/** Real pressure only from a pen; a mouse or finger would report a constant 0.5 or 1. */
let usePressure = false;
let strokeStyle: InkElement['style'] | null = null;

function reset(): void {
  active = false;
  before = null;
  points = [];
  strokeStyle = null;
  usePressure = false;
}

/** A pen that reports 0 at touch-down (some drivers do) counts as medium pressure. */
function pressureOf(raw: number): number {
  return usePressure && raw > 0 ? raw : 0.5;
}

/** Appends the event's samples, skipping those closer than INK_MIN_SAMPLE_PX to the previous one (`first` keeps the first). */
function addSamples(p: PointerInfo, first: boolean): void {
  const minDist = INK_MIN_SAMPLE_PX / getState().viewport.zoom;
  for (const sm of p.samples) {
    const last = points[points.length - 1];
    if (!first && last && Math.hypot(sm.world.x - last.x, sm.world.y - last.y) < minDist) continue;
    points.push({ x: sm.world.x, y: sm.world.y, p: pressureOf(sm.pressure) });
    first = false;
  }
}

/** The stroke so far as an element (never in the scene; the same shape as the committed one). */
function liveElement(): InkElement {
  return { id: 'live-ink', seed: 1, type: 'ink', ...normaliseInk(points), pressure: usePressure, style: strokeStyle! };
}

export const penTool: Tool = {
  id: 'pen',
  cursor: 'crosshair',

  onPointerDown(p) {
    const s = getState();
    const pen = s.pens[s.activePen]!;
    active = true;
    before = takeSnapshot();
    points = [];
    usePressure = p.pointerType === 'pen';
    strokeStyle = { ...s.currentStyle, strokeColor: pen.color, strokeWidth: pen.size, opacity: 100 };
    addSamples(p, true);
    setInteraction({ liveInk: liveElement() });
  },

  onPointerMove(p) {
    if (!active) {
      setInteraction({ cursor: null });
      return;
    }
    const n = points.length;
    addSamples(p, false);
    if (points.length !== n) setInteraction({ liveInk: liveElement() });
  },

  onPointerUp(p) {
    if (!active) return;
    addSamples(p, false);
    const snap = before;
    const style = strokeStyle;
    const pts = points;
    const pressure = usePressure;
    reset();
    setInteraction({ liveInk: null });
    if (!snap || !style || pts.length === 0) return;
    setElements(addElements(getState().elements, [createInk(pts, pressure, style)]));
    pushUndo(snap);
  },

  onCancel() {
    if (!active) return;
    reset();
    setInteraction({ liveInk: null });
  },
};
