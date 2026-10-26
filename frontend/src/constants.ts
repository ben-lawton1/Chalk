/**
 * Chalk shared constants.
 *
 * Was FROZEN during v1's parallel build; v2 may edit it freely.
 * May import types only (from ./types). No runtime logic.
 * Units: *_PX constants are SCREEN px (divide by zoom for world units);
 * everything else is world units, milliseconds or a plain number.
 */
import type {
  Arrowhead,
  Edges,
  FillStyle,
  FontFamily,
  PenSettings,
  StrokeStyle,
  Style,
  TextAlign,
} from './types';

// ---------------------------------------------------------------------------
// App / file format
// ---------------------------------------------------------------------------
export const APP_NAME = 'Chalk';
export const APP_VERSION = '0.1.0';
export const SCENE_FILE_TYPE = 'chalk/scene' as const;
export const SCENE_FILE_VERSION = 4 as const;

// ---------------------------------------------------------------------------
// Viewport
// ---------------------------------------------------------------------------
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 30;
/** Zoom buttons and Ctrl +/- multiply or divide by this. */
export const ZOOM_STEP_FACTOR = 1.2;
/** zoom *= exp(-deltaY * WHEEL_ZOOM_SPEED) for ctrl/cmd + wheel and trackpad pinch. */
export const WHEEL_ZOOM_SPEED = 0.01;
/** deltaY is clamped to +/- this before the zoom formula. */
export const WHEEL_ZOOM_MAX_DELTA = 20;
/** deltaMode === 1 (lines) is multiplied by this to get px. */
export const WHEEL_LINE_PX = 16;
export const FIT_PADDING_PX = 64;
/** zoomToFit never zooms in further than this by default. */
export const FIT_MAX_ZOOM = 2;
/** World-unit gap kept between the page's top-left edge and content that sits at negative coordinates. */
export const PAGE_MARGIN = 32;

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------
/** Unitless line height shared by canvas text and the textarea editor. */
export const LINE_HEIGHT = 1.25;
/** Inset of shape label boxes (world px). */
export const LABEL_PADDING = 8;
export const ARROW_LABEL_MAX_WIDTH = 240;
/** Padding of the background rect drawn behind arrow labels. */
export const ARROW_LABEL_BG_PAD = 4;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 400;
/** Approximate measurer (Node tests): width = chars * fontSize * APPROX_CHAR_WIDTH_EM. */
export const APPROX_CHAR_WIDTH_EM = 0.6;
/** Measurement cache is cleared when it reaches this many entries. */
export const TEXT_CACHE_LIMIT = 10_000;
export const FONT_LOAD_TIMEOUT_MS = 1500;

// ---------------------------------------------------------------------------
// Arrow binding
// ---------------------------------------------------------------------------
/** Gap between an arrow end and the outline: BIND_GAP + strokeWidth / 2 (world px). */
export const BIND_GAP = 5;
/** A point within this many screen px of an outline counts as "over" it for binding. */
export const BIND_DISTANCE_PX = 16;
/** Below this length (world px) a doubly-bound arrow falls back to its focus points. */
export const MIN_ARROW_LENGTH = 10;
/** Releasing deeper than this fraction of min(w, h) inside a shape anchors at that exact point. */
export const PRECISE_BIND_DEPTH_RATIO = 0.25;

// ---------------------------------------------------------------------------
// Gestures, hit testing, handles
// ---------------------------------------------------------------------------
export const DRAG_THRESHOLD_PX = 3;
/** Arrow / line tools create the element only after the pointer moved this far. */
export const LINE_CONFIRM_THRESHOLD_PX = 8;
export const PALETTE_DRAG_THRESHOLD_PX = 4;
export const HIT_TOLERANCE_PX = 8;
export const HANDLE_SIZE_PX = 8;
/** A handle is hit when the pointer is within HANDLE_HIT_PX / 2 of its center (Chebyshev). */
export const HANDLE_HIT_PX = 12;
export const ENDPOINT_RADIUS_PX = 6;
/** An endpoint is hit when the pointer is within this distance (Euclidean) of it. */
export const ENDPOINT_HIT_PX = 10;
/** n/s handles hidden when the box is narrower than this on screen; e/w when shorter. */
export const SIDE_HANDLE_MIN_PX = 30;
export const SELECTION_PADDING_PX = 4;
export const MIN_SHAPE_SIZE = 4;
export const DUPLICATE_OFFSET = 16;
export const NUDGE = 1;
export const NUDGE_SHIFT = 10;
export const ANGLE_SNAP_DEG = 15;

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
export const HISTORY_LIMIT = 100;
/** pushUndo calls with the same mergeKey within this window collapse into one entry. */
export const HISTORY_MERGE_MS = 1000;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
export const AUTOSAVE_DEBOUNCE_MS = 800;
export const AUTOSAVE_MAX_WAIT_MS = 5000;
export const AUTOSAVE_RETRY_BASE_MS = 2000;
export const AUTOSAVE_RETRY_MAX_MS = 30000;
/** fetch keepalive bodies must stay below ~64KB. */
export const KEEPALIVE_MAX_BYTES = 60000;
export const BOARD_LOAD_RETRIES = 5;
export const BOARD_LOAD_RETRY_MS = 1000;
export const VIEWPORT_SAVE_DEBOUNCE_MS = 400;
export const VIEWPORT_STORAGE_PREFIX = 'chalk:viewport:';
export const BACKUP_STORAGE_PREFIX = 'chalk:backup:';
export const DEFAULT_BOARD_NAME = 'Untitled page';
export const MAX_BOARD_NAME_LENGTH = 120;

// ---------------------------------------------------------------------------
// UI timing
// ---------------------------------------------------------------------------
export const TOAST_MS = 3500;
/** After Ctrl+V / Ctrl+X keydown, fall back to the in-app clipboard if no DOM event arrived. */
export const PASTE_FALLBACK_MS = 50;
/** Two-click delete confirmation window in the board list. */
export const DELETE_CONFIRM_MS = 3000;

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
export const GRID_SIZE = 20;
export const GRID_MIN_SPACING_PX = 12;
export const GRID_DOT_PX = 2;
export const SHOW_GRID = true;
/** Elements whose bounds are outside the visible rect expanded by this (screen px) are skipped. */
export const CULL_MARGIN_PX = 50;
export const ARROWHEAD_BASE = 12;
export const ARROWHEAD_ANGLE_DEG = 25;
/** Size of the position-independent rough.js drawable LRU cache. */
export const DRAWABLE_CACHE_LIMIT = 500;
export const EXPORT_PADDING = 32;
export const EXPORT_SCALE = 2;
export const MAX_CANVAS_SIDE = 16384;

// ---------------------------------------------------------------------------
// Colors and palettes
// ---------------------------------------------------------------------------
export const CANVAS_BACKGROUND = '#16181d';
export const GRID_COLOR = '#2a2f37';
export const SELECTION_COLOR = '#3fb984';
/** Index i is rendered as data-testid `style-stroke-${i}`. */
export const STROKE_COLORS = ['#e9ecef', '#ff6b6b', '#69db7c', '#4dabf7', '#ffa94d'] as const;
/** Index i is rendered as data-testid `style-bg-${i}`; index 0 is transparent. */
export const BACKGROUND_COLORS = ['transparent', '#5c2a2a', '#1f4a2c', '#1d3b57', '#5a4a17'] as const;
export const STROKE_WIDTHS = [1, 2, 4] as const;
export const FONT_SIZES = [16, 24, 32, 48] as const;
export const ROUGHNESS_LEVELS = [0, 1, 2] as const;
export const FILL_STYLES: readonly FillStyle[] = ['hachure', 'cross-hatch', 'solid'];
export const STROKE_STYLES: readonly StrokeStyle[] = ['solid', 'dashed', 'dotted'];
export const FONT_FAMILIES: readonly FontFamily[] = ['hand', 'sans', 'mono'];
export const TEXT_ALIGNS: readonly TextAlign[] = ['left', 'center', 'right'];
export const ARROWHEADS: readonly Arrowhead[] = ['none', 'arrow', 'triangle'];
export const EDGES: readonly Edges[] = ['sharp', 'round'];

/** CSS font-family stacks. The canvas font string and the textarea MUST use the same stack. */
export const FONT_STACKS: Record<FontFamily, string> = {
  hand: 'Caveat, "Segoe Print", cursive',
  sans: '"Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif',
  mono: 'ui-monospace, "Cascadia Code", Consolas, Menlo, monospace',
};

/** Defaults for new elements and for fields missing on import. Never mutate; always spread. */
export const DEFAULT_STYLE: Style = {
  strokeColor: '#e9ecef',
  backgroundColor: 'transparent',
  fillStyle: 'hachure',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 1,
  opacity: 100,
  edges: 'round',
  fontSize: 24,
  fontFamily: 'hand',
  textAlign: 'left',
  startArrowhead: 'none',
  endArrowhead: 'arrow',
};

// ---------------------------------------------------------------------------
// Pen, ink and touch (all tunable). *_PX are screen px, *_MS are milliseconds.
// ---------------------------------------------------------------------------
/** Pen colours, chosen for the dark canvas. Index i is rendered as data-testid `pen-color-${i}`. */
export const PEN_COLORS = ['#e9ecef', '#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#b197fc', '#f783ac'] as const;
/** Pen sizes (world px). Index i is rendered as data-testid `pen-size-${i}`. */
export const PEN_SIZES = [2, 3, 5, 8, 12] as const;
export const DEFAULT_PENS: readonly PenSettings[] = [
  { color: '#e9ecef', size: 3 },
  { color: '#ff6b6b', size: 3 },
  { color: '#4dabf7', size: 5 },
];
/** perfect-freehand options: how much pressure thins the line, how much the outline is smoothed, how much the input is streamlined. */
export const INK_THINNING = 0.6;
export const INK_SMOOTHING = 0.5;
export const INK_STREAMLINE = 0.45;
/** Samples closer than this to the previous one (screen px) are skipped. */
export const INK_MIN_SAMPLE_PX = 0.75;
/** Eraser ring radius (screen px). */
export const ERASER_RADIUS_PX = 10;
/** An element is lassoed when at least this fraction of its sample points are inside the lasso. */
export const LASSO_MIN_INSIDE = 0.7;
/** Lasso points closer than this to the previous one (screen px) are skipped. */
export const LASSO_MIN_SAMPLE_PX = 3;
/** A touch that moves less than this (screen px) and lifts within TOUCH_TAP_MAX_MS is a tap. */
export const TOUCH_TAP_SLOP_PX = 10;
export const TOUCH_TAP_MAX_MS = 500;
/** Two taps within this time (ms) and distance (screen px) are a double tap. */
export const DOUBLE_TAP_MS = 350;
export const DOUBLE_TAP_SLOP_PX = 30;
/** Hit tolerance for finger taps and the selection box (screen px). */
export const TOUCH_HIT_TOLERANCE_PX = 16;
/** Handle hit size for a finger / a pen tip (screen px, like HANDLE_HIT_PX). */
export const TOUCH_HANDLE_HIT_PX = 32;
export const PEN_HANDLE_HIT_PX = 16;
/** Touches are ignored this long (ms) after the last pen event (palm rejection). */
export const PALM_GRACE_MS = 500;
export const PEN_PREFS_STORAGE_KEY = 'chalk:pens';

// ---------------------------------------------------------------------------
// Page notes (v4)
// ---------------------------------------------------------------------------
/** Top-left of the notes column in world px: just inside the page's home corner. */
export const NOTES_X = PAGE_MARGIN + 16;
export const NOTES_Y = 96; // below the top bar and the main toolbar (their bottom edge is about 66 px at 100% zoom)
export const NOTES_WIDTH = 760;
export const NOTES_MIN_WIDTH = 320;
export const NOTES_MAX_WIDTH = 2000;
export const NOTES_FONT_SIZE = 16;
/** localStorage key prefix for the last caret position per page: `chalk:notes-caret:<boardId>`. */
export const NOTES_CARET_KEY = 'chalk:notes-caret:';
/** Limits applied when a notes document is read from a file: nesting depth, node count and text length. */
export const NOTES_MAX_DEPTH = 32;
export const NOTES_MAX_NODES = 100_000;
export const NOTES_MAX_TEXT_LENGTH = 2_000_000;
/** The /table prompt clamps to these. */
export const TABLE_MAX_ROWS = 50;
export const TABLE_MAX_COLS = 12;
/** A double-click this far (world px) below the last notes block, inside the column width, still enters notes mode. */
export const NOTES_BELOW_SLACK = 400;
/** Screen px kept between the caret line and the stage edge before the view pans to the caret. */
export const NOTES_CARET_MARGIN_PX = 40;
