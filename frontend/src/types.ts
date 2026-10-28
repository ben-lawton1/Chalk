/**
 * Chalk shared contract types.
 *
 * Frozen after v1's WP0; v2 (notebooks, sidebar, page canvas) may edit it.
 * This file imports nothing and contains no runtime code (types only).
 *
 * Conventions:
 * - Every 2D value is a {x, y} object (never a tuple), except Binding.fixedPoint,
 *   which is a [fx, fy] ratio pair.
 * - World units: the infinite canvas coordinate space elements live in.
 * - Screen units: CSS px relative to the canvas top-left. With the sidebar open the canvas sits at
 *   `left: var(--sidebar-w)`, so client = screen + the canvas rect origin (the test hook adds it).
 * - screen = (world + scroll) * zoom ; world = screen / zoom - scroll.
 * - Elements are immutable: every change creates a new object (render caches
 *   are keyed by object identity).
 */

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** A 2D point or vector, in world or screen units depending on context. */
export interface Point {
  x: number;
  y: number;
}

/** Axis-aligned rectangle. Always normalized: width >= 0 and height >= 0. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A width/height pair (CSS px for screens, world units for shapes). */
export interface Size {
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Style (one bag per element; each renderer reads the fields it needs)
// ---------------------------------------------------------------------------

/** Registered shape kinds. Adding a kind = add it here + an entry in core/shapes.ts SHAPES. */
export type ShapeKind = 'rectangle' | 'diamond' | 'ellipse' | 'triangle';
export type FillStyle = 'hachure' | 'cross-hatch' | 'solid';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export type FontFamily = 'hand' | 'sans' | 'mono';
export type TextAlign = 'left' | 'center' | 'right';
export type Arrowhead = 'none' | 'arrow' | 'triangle';
export type Edges = 'sharp' | 'round';

/** Visual style of an element. Every element carries a full Style (irrelevant fields are ignored). */
export interface Style {
  /** '#rrggbb' */
  strokeColor: string;
  /** '#rrggbb' or 'transparent' */
  backgroundColor: string;
  fillStyle: FillStyle;
  /** UI offers 1 | 2 | 4; any finite value > 0 is accepted on import. */
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  /** 0 = architect (clean), 1 = artist, 2 = cartoonist. */
  roughness: number;
  /** 0..100 */
  opacity: number;
  /** Rectangles only. */
  edges: Edges;
  /** World px. Used by free text, shape labels and arrow labels. */
  fontSize: number;
  fontFamily: FontFamily;
  /** Free text only; labels are always centered. */
  textAlign: TextAlign;
  /** Arrows only. */
  startArrowhead: Arrowhead;
  /** Arrows only. */
  endArrowhead: Arrowhead;
}

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

export interface ElementBase {
  /** newId(): 12 chars [A-Za-z0-9]. Unique within a scene. */
  id: string;
  /** rough.js seed: integer in [1, 2^31 - 2]. NEVER 0 (rough.js would fall back to Math.random). */
  seed: number;
  style: Style;
}

/** A rectangle / diamond / ellipse / triangle, with an optional embedded label. */
export interface ShapeElement extends ElementBase {
  type: 'shape';
  shape: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  /** '' = no label. Wrapped and centered inside SHAPES[shape].labelBox. */
  label: string;
}

/** Free-floating text. */
export interface TextElement extends ElementBase {
  type: 'text';
  /** Top-left corner. */
  x: number;
  y: number;
  /**
   * autoResize = true: width/height are DERIVED by core/text.withMeasuredText (never set by hand).
   * autoResize = false: width is a fixed wrap width chosen by the user; height is derived.
   */
  width: number;
  height: number;
  text: string;
  /** true = grows with the text (no wrapping); false = fixed width box that wraps. */
  autoResize: boolean;
}

/**
 * An arrow end attached to a bindable element.
 * fixedPoint = focus point as ratios of the target's bounding box ([0.5, 0.5] = center).
 */
export interface Binding {
  elementId: string;
  fixedPoint: [number, number];
}

/** A straight connector. The "line" tool creates an arrow with both heads 'none'. */
export interface ArrowElement extends ElementBase {
  type: 'arrow';
  /** World coordinates. ALWAYS the resolved, drawn endpoints. */
  start: Point;
  end: Point;
  startBinding: Binding | null;
  endBinding: Binding | null;
  /** '' = none. Drawn centered at the midpoint. */
  label: string;
}

/** One sample of a freehand stroke, relative to the stroke's (x, y). */
export interface InkPoint {
  x: number;
  y: number;
  /** 0..1 */
  p: number;
}

/** A freehand stroke. Points are RELATIVE to (x, y) = the min corner of the points; width/height = their extent. */
export interface InkElement extends ElementBase {
  type: 'ink';
  x: number;
  y: number;
  width: number;
  height: number;
  points: InkPoint[];
  /** true = p came from a pressure-sensitive pen; false = the renderer simulates pressure from speed. */
  pressure: boolean;
}

/** Named ChalkElement (NOT `Element`) so it never shadows the DOM global. */
export type ChalkElement = ShapeElement | TextElement | ArrowElement | InkElement;
/** Elements an arrow end may bind to. */
export type BindableElement = ShapeElement | TextElement;
export type ElementType = ChalkElement['type'];

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

/** screen = (world + scroll) * zoom ; world = screen / zoom - scroll. */
export interface Viewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type EndpointId = 'start' | 'end';
/**
 * none      - nothing selected (or only the element being edited)
 * box       - 8 handles around the selection box (side handles hidden when small)
 * text      - single text element: 4 corners (scale font) + e/w (fixed wrap width)
 * endpoints - single arrow: two endpoint circles
 */
export type HandleMode = 'none' | 'box' | 'text' | 'endpoints';
export type ReorderDir = 'front' | 'back' | 'forward' | 'backward';
export type ToolId = 'select' | 'hand' | ShapeKind | 'arrow' | 'line' | 'text' | 'pen' | 'eraser' | 'lasso';

/** One of the three configurable pens. `size` is the stroke width in world px. */
export interface PenSettings {
  color: string;
  size: number;
}

/** Result of laying out the text of a text element, a shape label or an arrow label. */
export interface TextLayout {
  lines: string[];
  /** World box of the text block; lines are aligned within `width`. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** World px. */
  fontSize: number;
  /** World px (fontSize * LINE_HEIGHT). */
  lineHeight: number;
  /** CSS font string at fontSize, e.g. `24px Caveat, "Segoe Print", cursive`. */
  font: string;
  align: TextAlign;
  /** True when lines were wrapped to `width` (labels, fixed-width text). */
  wrap: boolean;
}

/** hitTest result. hollow = found only because the point is inside an unfilled, unlabeled shape. */
export interface HitResult {
  element: ChalkElement;
  hollow: boolean;
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

/** What undo/redo restores. Arrays share unchanged element objects (cheap). */
export interface Snapshot {
  elements: readonly ChalkElement[];
  selectedIds: readonly string[];
}

/** In-place editing of el.text (text) or el.label (shape / arrow). */
export interface Editing {
  id: string;
  /** State before editing started; pushed to history once, on commit. */
  before: Snapshot;
}

/** Highlight of the shape an arrow end will attach to. */
export interface BindTargetHighlight {
  elementId: string;
  /** World focus point that will be used. */
  focus: Point;
}

/** True-size preview drawn on the interactive canvas while a palette shape is dragged over it. */
export interface DropPreview {
  kind: ShapeKind;
  /** World rect. */
  rect: Rect;
}

/** Transient interaction state (never saved, never in history). */
export interface Interaction {
  /** World rect of the selection marquee. */
  marquee: Rect | null;
  bindTarget: BindTargetHighlight | null;
  hoverId: string | null;
  /** Tool-requested cursor override (e.g. 'nwse-resize'); null = tool default. */
  cursor: string | null;
  /** True between pointerdown and pointerup on the canvas. */
  gestureActive: boolean;
  dropPreview: DropPreview | null;
  /** Freehand stroke being drawn (pen tool); committed on pointer up. */
  liveInk: InkElement | null;
  /** World points of the lasso being drawn. */
  lasso: Point[] | null;
  /** World position of the eraser ring while erasing. */
  eraser: Point | null;
}

export type SaveStatus = 'loading' | 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

export interface BoardMeta {
  id: string;
  name: string;
  /** Folder names as the server returned them (empty until known). */
  notebook: string;
  section: string;
  /** Server version this client last saw (sent as baseVersion). */
  version: number;
}

export interface ToastState {
  id: number;
  message: string;
  kind: 'info' | 'error';
}

export type DialogId = 'none' | 'help';

export interface AppState {
  /** Z-order = array order (last = top). */
  elements: readonly ChalkElement[];
  /** Ids in selection order (no duplicates). */
  selectedIds: readonly string[];
  viewport: Viewport;
  /** Canvas CSS size; {0,0} until the canvas is measured. */
  viewportSize: Size;
  tool: ToolId;
  toolLocked: boolean;
  /** Defaults for new elements; updated by the style panel. */
  currentStyle: Style;
  editing: Editing | null;
  interaction: Interaction;
  /** null until a board is loaded. */
  board: BoardMeta | null;
  saveStatus: SaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  /** Notebook tree from GET /library; null until the first load. */
  library: LibraryTree | null;
  sidebarOpen: boolean;
  dialog: DialogId;
  toast: ToastState | null;
  /** Always 3 pens. */
  pens: PenSettings[];
  activePen: number;
  /** Swaps which pen button erases and which lassos (for styluses that report them the other way round). */
  penButtonsSwapped: boolean;
  penTrayOpen: boolean;
  /** The page's typed notes column (v4); null when the page has none. The editor owns its undo history, so this is not in snapshots. */
  notes: NotesDoc | null;
  /** Notes mode: the notes column takes pointer input and holds the caret. */
  notesActive: boolean;
  /** Measured world rect of the rendered column (transient); null when empty or not measured. */
  notesBounds: Rect | null;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/** Normalized pointer event handed to tools. */
export interface PointerInfo {
  world: Point;
  screen: Point;
  shift: boolean;
  alt: boolean;
  /** ctrlKey || metaKey */
  mod: boolean;
  /** MouseEvent.button of the event (0 left, 1 middle, 2 right). */
  button: number;
  /** MouseEvent.buttons bitmask. Informational only: tools never read it; the pointer router alone decides what is a gesture. */
  buttons: number;
  pointerType: 'mouse' | 'pen' | 'touch';
  /** 0..1 */
  pressure: number;
  /** Coalesced samples of this event (world + pressure); at least the event itself. Used for ink. */
  samples: { world: Point; pressure: number }[];
}

export interface Tool {
  id: ToolId;
  /** Default CSS cursor while this tool is active. */
  cursor: string;
  onPointerDown(p: PointerInfo): void;
  /** Also called on hover (no gesture). Tools tell the two apart with their own `active` flag, set in onPointerDown. */
  onPointerMove(p: PointerInfo): void;
  onPointerUp(p: PointerInfo): void;
  onDoubleClick?(p: PointerInfo): void;
  /** Escape, pointercancel, lost capture or window blur during a gesture: MUST restore the pre-gesture state and clear `active`. */
  onCancel?(): void;
}

// ---------------------------------------------------------------------------
// Shape registry (the "add a shape" seam)
// ---------------------------------------------------------------------------

export type Outline =
  /** Convex polygon, clockwise in screen orientation (y down). */
  | { kind: 'polygon'; points: Point[] }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number };

export interface ShapeDef {
  kind: ShapeKind;
  title: string;
  /** Keyboard shortcuts: lowercase letters and/or single digits, e.g. ['r', '2']. */
  shortcuts: readonly string[];
  defaultSize: Size;
  /** Outline used for hit testing, arrow attachment and overlays. */
  outline(r: Rect): Outline;
  /** Where the label wraps and centers. Its height MUST grow linearly with r.height. */
  labelBox(r: Rect): Rect;
  /** Optional SVG path (in the coordinates of r) used for drawing instead of the outline. */
  path?(r: Rect, style: Style): string | null;
  /** SVG path 'd' in a 24x24 box (toolbar icon). */
  icon: string;
}

// ---------------------------------------------------------------------------
// Files & API (wire format; see backend/app/models.py)
// ---------------------------------------------------------------------------

/** The one serialization format: downloads, API `scene`, clipboard payload. UI state is never included. */
export interface SceneFile {
  type: 'chalk/scene';
  version: 4;
  elements: ChalkElement[];
  /** v4: the page notes. Absent or null in older files. */
  notes?: NotesDoc | null;
}

/** ProseMirror JSON, typed loosely; the editor drops node types it does not know. */
export interface NotesJSON {
  type: string;
  attrs?: Record<string, unknown>;
  content?: NotesJSON[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

export interface NotesDoc {
  /** World px; stored per page so the column can later be resized. */
  width: number;
  doc: NotesJSON;
}

export interface BoardSummary {
  id: string;
  name: string;
  version: number;
  /** ISO-8601 UTC with milliseconds and 'Z'. */
  updatedAt: string;
  notebook: string;
  section: string;
}

export interface Board extends BoardSummary {
  /** Opaque on the server; parse with core/serialize.parseSceneFile. */
  scene: SceneFile;
  createdAt: string;
}

export interface BoardCreateRequest {
  name?: string;
  scene?: SceneFile;
  /** Both or neither. */
  notebook?: string;
  section?: string;
}

export interface SectionNode {
  name: string;
  pages: BoardSummary[];
}

export interface NotebookNode {
  name: string;
  sections: SectionNode[];
}

export interface LibraryTree {
  /** Display label of the library folder. */
  path: string;
  notebooks: NotebookNode[];
}

/** Response of notebook/section create and rename: the final (sanitised, de-duplicated) name. */
export interface FolderInfo {
  name: string;
}

/** baseVersion: integer = checked write (409 on mismatch); omitted or null = forced overwrite. */
export interface BoardUpdateRequest {
  name?: string;
  scene?: SceneFile;
  baseVersion?: number | null;
}

/** Body of a 409 response is { detail: ConflictDetail }. */
export interface ConflictDetail {
  message: 'Version conflict';
  currentVersion: number;
}

export interface HealthResponse {
  status: 'ok';
}

export interface AppConfig {
  terminalUrl: string;
}

export interface ShortcutInfo {
  /** Display string, e.g. 'Ctrl + Z'. */
  keys: string;
  description: string;
  group: 'Tools' | 'Edit' | 'View' | 'File' | 'Pen & touch' | 'Notes';
}

// ---------------------------------------------------------------------------
// Test hook (window.__CHALK__), installed in every build, read-only except flushSave
// ---------------------------------------------------------------------------

export interface ChalkTestAppState {
  tool: ToolId;
  toolLocked: boolean;
  viewport: Viewport;
  viewportSize: Size;
  editingId: string | null;
  boardId: string | null;
  boardName: string | null;
  boardVersion: number | null;
  saveStatus: SaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  dialog: DialogId;
  pens: PenSettings[];
  activePen: number;
  penButtonsSwapped: boolean;
  penTrayOpen: boolean;
  notesActive: boolean;
  interaction: {
    marquee: Rect | null;
    bindTargetId: string | null;
    hoverId: string | null;
    dropPreview: DropPreview | null;
    gestureActive: boolean;
    lassoActive: boolean;
    liveInkPoints: number;
  };
}

export interface ChalkTestHook {
  version: 1;
  /** board loaded && saveStatus !== 'loading' */
  isReady(): boolean;
  /** Deep copy (structuredClone) of the elements. */
  getElements(): ChalkElement[];
  getSelectedIds(): string[];
  /** Deep copy of the page notes (ProseMirror JSON + width), or null. */
  getNotes(): NotesDoc | null;
  /** The notes as plain text, top-level blocks joined by a newline. */
  getNotesText(): string;
  getAppState(): ChalkTestAppState;
  /** World -> client px (includes the canvas offset, i.e. the open sidebar). */
  worldToScreen(p: Point): Point;
  /** Takes client px. */
  screenToWorld(p: Point): Point;
  /** Bounds of an element in client px, or null if missing. */
  getElementScreenBounds(id: string): Rect | null;
  /** Saves now if dirty; resolves when settled, rejects on failure. */
  flushSave(): Promise<void>;
  /** Resolves after the next animation frame in which no canvas layer has a pending redraw. */
  whenRendered(): Promise<void>;
}

declare global {
  interface Window {
    __CHALK__?: ChalkTestHook;
  }
}
