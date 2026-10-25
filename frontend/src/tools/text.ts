// Text tool: click an element to edit its text, click empty canvas to create a text box (WP3).
import type { Tool } from '../types';
import { hitTest } from '../core/geometry';
import { getState, setInteraction } from '../state/store';
import { createTextAt, startEditing } from '../state/actions';

let active = false;

export const textTool: Tool = {
  id: 'text',
  cursor: 'text',

  onPointerDown(p) {
    active = true;
    const s = getState();
    const hit = hitTest(s.elements, p.world, s.viewport.zoom);
    if (hit) startEditing(hit.element.id);
    else createTextAt(p.world);
  },

  onPointerMove() {
    if (!active) setInteraction({ cursor: null });
  },

  onPointerUp() {
    active = false;
  },

  onCancel() {
    active = false;
  },
};
