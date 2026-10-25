// Pure model of which style-panel sections show and which values they display. Owner: WP4.
import type { AppState, ChalkElement, Style, ToolId } from '../types';

export interface PanelSections {
  stroke: boolean; background: boolean; fill: boolean; strokeWidth: boolean; strokeStyle: boolean;
  roughness: boolean; edges: boolean; arrowheads: boolean; fontSize: boolean; fontFamily: boolean; textAlign: boolean;
  opacity: boolean; layers: boolean;
}
export interface PanelModel { visible: boolean; sections: PanelSections; values: Style }

const NO_SECTIONS: PanelSections = {
  stroke: false, background: false, fill: false, strokeWidth: false, strokeStyle: false,
  roughness: false, edges: false, arrowheads: false, fontSize: false, fontFamily: false, textAlign: false,
  opacity: false, layers: false,
};

/** Same rule as tools/index.isDrawingTool, kept local so this module stays free of the tool graph. */
function isDrawing(tool: ToolId): boolean {
  return tool !== 'select' && tool !== 'hand';
}

export function getPanelModel(s: Pick<AppState, 'elements' | 'selectedIds' | 'tool' | 'currentStyle'>): PanelModel {
  const byId = new Map<string, ChalkElement>();
  for (const el of s.elements) byId.set(el.id, el);
  const selected: ChalkElement[] = [];
  for (const id of s.selectedIds) {
    const el = byId.get(id);
    if (el) selected.push(el);
  }
  const hasSelection = selected.length > 0;
  const visible = hasSelection || isDrawing(s.tool);
  if (!visible) return { visible: false, sections: { ...NO_SECTIONS }, values: s.currentStyle };

  let shape = false;
  let rect = false;
  let arrow = false;
  let text = false;
  if (hasSelection) {
    for (const el of selected) {
      if (el.type === 'shape') { shape = true; if (el.shape === 'rectangle') rect = true; }
      else if (el.type === 'arrow') arrow = true;
      else text = true;
    }
  } else if (s.tool === 'arrow' || s.tool === 'line') {
    arrow = true;
  } else if (s.tool === 'text') {
    text = true;
  } else {
    shape = true;
    rect = s.tool === 'rectangle';
  }

  const sections: PanelSections = {
    stroke: true,
    background: shape,
    fill: shape,
    strokeWidth: shape || arrow,
    strokeStyle: shape || arrow,
    roughness: shape || arrow,
    edges: rect,
    arrowheads: arrow && !(!hasSelection && s.tool === 'line'),
    fontSize: text || shape || arrow,
    fontFamily: text || shape || arrow,
    textAlign: text,
    opacity: true,
    layers: hasSelection,
  };
  return { visible: true, sections, values: hasSelection ? selected[0].style : s.currentStyle };
}
