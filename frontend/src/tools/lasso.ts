// Lasso tool: draw a loop; the elements mostly inside it become the selection (v3).
import type { Point, PointerInfo, Tool } from '../types';
import { LASSO_MIN_SAMPLE_PX } from '../constants';
import { elementsInLasso } from '../core/geometry';
import { worldToScreen } from '../core/viewport';
import { getState, setInteraction, setSelection } from '../state/store';

let active = false;
let points: Point[] = [];

function reset(): void {
  active = false;
  points = [];
}

/** Appends the event's samples, skipping those within LASSO_MIN_SAMPLE_PX (screen) of the previous one. */
function addSamples(p: PointerInfo, first: boolean): void {
  const v = getState().viewport;
  for (const sm of p.samples) {
    const last = points[points.length - 1];
    if (!first && last) {
      const a = worldToScreen(last, v);
      const b = worldToScreen(sm.world, v);
      if (Math.hypot(a.x - b.x, a.y - b.y) < LASSO_MIN_SAMPLE_PX) continue;
    }
    points.push(sm.world);
    first = false;
  }
}

export const lassoTool: Tool = {
  id: 'lasso',
  cursor: 'crosshair',

  onPointerDown(p) {
    active = true;
    points = [];
    addSamples(p, true);
    setInteraction({ lasso: [...points] });
  },

  onPointerMove(p) {
    if (!active) {
      setInteraction({ cursor: null });
      return;
    }
    const n = points.length;
    addSamples(p, false);
    if (points.length !== n) setInteraction({ lasso: [...points] });
  },

  onPointerUp(p) {
    if (!active) return;
    addSamples(p, false);
    const pts = points;
    reset();
    setInteraction({ lasso: null });
    // A tap, or a scribble too short to enclose anything, clears the selection. The tool stays the same.
    setSelection(pts.length >= 3 ? elementsInLasso(getState().elements, pts) : []);
  },

  onCancel() {
    if (!active) return;
    reset();
    setInteraction({ lasso: null });
  },
};
