// TOOLS registry, toolbar order and shortcut lookup; the "add a tool" seam (WP0).
import type { ShapeKind, Tool, ToolId } from '../types';
import { SHAPES, SHAPE_KINDS } from '../core/shapes';
import { selectTool } from './select';
import { handTool } from './hand';
import { arrowTool, lineTool } from './arrow';
import { textTool } from './text';
import { createShapeTool } from './shape';

export interface ToolInfo { title: string; shortcuts: readonly string[] }

const shapeTools = Object.fromEntries(SHAPE_KINDS.map((k) => [k, createShapeTool(k)])) as Record<ShapeKind, Tool>;
const shapeInfo = Object.fromEntries(
  SHAPE_KINDS.map((k) => [k, { title: SHAPES[k].title, shortcuts: SHAPES[k].shortcuts }]),
) as Record<ShapeKind, ToolInfo>;

export const TOOLS: Record<ToolId, Tool> = {
  select: selectTool, hand: handTool, arrow: arrowTool, line: lineTool, text: textTool, ...shapeTools,
};
/** Toolbar order. */
export const TOOLBAR: readonly ToolId[] = ['hand', 'select', ...SHAPE_KINDS, 'arrow', 'line', 'text'];
export const TOOL_INFO: Record<ToolId, ToolInfo> = {
  select: { title: 'Select', shortcuts: ['v', '1'] },
  hand: { title: 'Hand (pan)', shortcuts: ['h'] },
  arrow: { title: 'Arrow', shortcuts: ['a', '6'] },
  line: { title: 'Line', shortcuts: ['l', '7'] },
  text: { title: 'Text', shortcuts: ['t', '8'] },
  ...shapeInfo,
};
/** Shapes, arrow, line and text. */
export function isDrawingTool(t: ToolId): boolean {
  return t !== 'select' && t !== 'hand';
}
/** `key` is a lowercase letter or a single digit; returns the tool whose shortcuts include it. */
export function toolForKey(key: string): ToolId | null {
  for (const id of Object.keys(TOOL_INFO) as ToolId[]) if (TOOL_INFO[id].shortcuts.includes(key)) return id;
  return null;
}
