// Inline SVG icon set (24x24, stroke based, currentColor) and the tool icon lookup. Owner: WP4.
import type { ToolId } from '../types';
import { SHAPES, isShapeKind } from '../core/shapes';

export type IconName = 'hand' | 'select' | 'arrow' | 'line' | 'text' | 'lock' | 'unlock' | 'undo' | 'redo' | 'menu'
  | 'help' | 'zoomIn' | 'zoomOut' | 'fit' | 'trash' | 'duplicate' | 'front' | 'back' | 'forward' | 'backward' | 'close' | 'home'
  | 'notes' | 'sidebar' | 'chevron' | 'notebook' | 'plus' | 'more' | 'pencil' | 'pen' | 'eraser' | 'lasso'
  | 'terminal' | 'minimise' | 'chevronDown';

/** SVG path data per icon, drawn with a 1.75px round stroke in a 24x24 box. */
const PATHS: Record<IconName, string> = {
  hand: 'M8 13V6.5a1.5 1.5 0 0 1 3 0V11 M11 10.5V4.5a1.5 1.5 0 0 1 3 0V11 M14 11V6a1.5 1.5 0 0 1 3 0v7 M17 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.4a6 6 0 0 1-4.7-2.3L4.8 15a1.6 1.6 0 0 1 2.4-2.1L8 14',
  select: 'M5 3.5l13.5 6.2-5.9 2-2.1 5.9z',
  arrow: 'M5 19L19 5 M9.5 5H19v9.5',
  line: 'M5 19L19 5',
  text: 'M5 7V5h14v2 M12 5v14 M9 19h6',
  lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  unlock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 6.9-.9',
  undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1.9-1.1 1.7 M12 17h.01',
  zoomIn: 'M12 5v14 M5 12h14',
  zoomOut: 'M5 12h14',
  fit: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
  duplicate: 'M8 8h12v12H8z M4 16V4h12',
  front: 'M12 20V9 M7 13l5-5 5 5 M5 4h14',
  back: 'M12 4v11 M7 11l5 5 5-5 M5 20h14',
  forward: 'M12 19V7 M7 11l5-5 5 5',
  backward: 'M12 5v12 M7 13l5 5 5-5',
  close: 'M6 6l12 12 M18 6L6 18',
  home: 'M4 11l8-7 8 7 M6 10v10h4v-6h4v6h4V10',
  notes: 'M6 3.5h9l3.5 3.5v13.5H6z M14.5 3.5V7.5H18.5 M9 12h6 M9 15.5h6 M9 8.5h2.5',
  sidebar: 'M4 5h16v14H4z M9.5 5v14',
  chevron: 'M9 6l6 6-6 6',
  notebook: 'M7 4h10.5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7z M7 4v16 M4.5 8H7 M4.5 12H7 M4.5 16H7',
  plus: 'M12 5v14 M5 12h14',
  terminal: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M7 10l3 2.5L7 15 M12.5 15H17',
  minimise: 'M6 10l6 6 6-6',
  chevronDown: 'M6 9l6 6 6-6',
  more: 'M4 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0 M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0 M18 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  pencil: 'M4 20l1-4L16 5l3 3L8 19z M14 7l3 3',
  pen: 'M12 3l5 6-3 8h-4L7 9z M12 17v4 M12 11v.01 M12 3v6',
  eraser: 'M5.5 14.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H8l-2.5-2.7a1.4 1.4 0 0 1 0-1.8z M10 10l5 5 M13 19h7',
  lasso: 'M12 4c-4.4 0-8 1.8-8 4.2S7.6 12.4 12 12.4s8-1.8 8-4.2S16.4 4 12 4z M8.5 12c-1 2.2-.5 4 1.5 5 1.4.7 1.5 2 .5 3',
};

function Svg(props: { d: string; size: number }) {
  return (
    <svg
      width={props.size}
      height={props.size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={props.d} />
    </svg>
  );
}

export function Icon(props: { name: IconName; size?: number }) {
  return <Svg d={PATHS[props.name]} size={props.size ?? 20} />;
}

/** Shapes use the SHAPES registry icon so a new shape gets a toolbar icon for free. */
export function ToolIcon(props: { tool: ToolId; size?: number }) {
  const size = props.size ?? 20;
  const tool = props.tool;
  if (isShapeKind(tool)) return <Svg d={SHAPES[tool].icon} size={size} />;
  return <Svg d={PATHS[tool]} size={size} />;
}
