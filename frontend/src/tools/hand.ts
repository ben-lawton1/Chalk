// Hand tool: pan the viewport by dragging (also used for middle-button and Space+drag) (WP3).
import type { Point, PointerInfo, Tool, Viewport } from '../types';
import { panBy } from '../core/viewport';
import { getState, setViewport } from '../state/store';

let active = false;
let startScreen: Point | null = null;
let startViewport: Viewport | null = null;

function reset(): void {
  active = false;
  startScreen = null;
  startViewport = null;
}

function step(p: PointerInfo): void {
  if (!active || !startScreen || !startViewport) return;
  setViewport(panBy(startViewport, p.screen.x - startScreen.x, p.screen.y - startScreen.y));
}

export const handTool: Tool = {
  id: 'hand',
  cursor: 'grab',

  onPointerDown(p) {
    active = true;
    startScreen = p.screen;
    startViewport = getState().viewport;
  },

  onPointerMove(p) {
    step(p);
  },

  onPointerUp(p) {
    step(p);
    reset();
  },

  onCancel() {
    if (startViewport) setViewport(startViewport);
    reset();
  },
};
