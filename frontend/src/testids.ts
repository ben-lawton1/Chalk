/**
 * data-testid contract shared by the UI and the Playwright suite.
 *
 * Frozen after v1 WP0; v2 may edit it (keep both copies identical). A byte-identical copy lives at e2e/tests/testids.ts.
 * This file must stay self-contained: NO imports.
 */

export const TID = {
  // Canvas
  canvasContainer: 'canvas-container',
  canvasStatic: 'canvas-static',
  canvasInteractive: 'canvas-interactive',
  textEditor: 'text-editor',

  // Toolbar (tool buttons use tidTool)
  toolLock: 'tool-lock',
  dragGhost: 'drag-ghost',
  toolNotes: 'tool-notes',

  // Page notes (v4)
  notesLayer: 'notes-layer',
  notesColumn: 'notes-column',
  notesEditor: 'notes-editor',
  notesLinkInput: 'notes-link-input',
  pageLink: 'page-link',

  // Slash menu, /table size step, table toolbar and page picker (v4 N-C). Rows use the tid* helpers below.
  slashMenu: 'slash-menu',
  slashEmpty: 'slash-empty',
  tableStep: 'table-step',
  tableRows: 'table-rows',
  tableCols: 'table-cols',
  tableHeader: 'table-header',
  tablePreview: 'table-preview',
  tableInsert: 'table-insert',
  tableToolbar: 'table-toolbar',
  pageMenu: 'page-menu',
  pageMenuNew: 'page-menu-new',

  // Style panel (swatches and options use the tid* helpers below)
  stylePanel: 'style-panel',
  strokeCustom: 'style-stroke-custom',
  bgCustom: 'style-bg-custom',
  opacity: 'style-opacity',

  // Selection actions
  actionFront: 'action-front',
  actionForward: 'action-forward',
  actionBackward: 'action-backward',
  actionBack: 'action-back',
  actionDuplicate: 'action-duplicate',
  actionDelete: 'action-delete',

  // View and history
  zoomOut: 'zoom-out',
  zoomReset: 'zoom-reset',
  zoomIn: 'zoom-in',
  zoomFit: 'zoom-fit',
  zoomHome: 'zoom-home',
  undo: 'undo',
  redo: 'redo',
  scrollToContent: 'scroll-to-content',

  // Main menu
  menuButton: 'menu-button',
  menuNewBoard: 'menu-new-board',
  menuImport: 'menu-import',
  menuExportJson: 'menu-export-json',
  menuExportPng: 'menu-export-png',
  menuHelp: 'menu-help',
  importFileInput: 'import-file-input',

  // Board name and save status
  boardName: 'board-name',
  saveStatus: 'save-status',

  // Conflict banner
  conflictBanner: 'conflict-banner',
  conflictReload: 'conflict-reload',
  conflictOverwrite: 'conflict-overwrite',

  // Sidebar (rows use tidNotebook / tidSection / tidPage and the tidRow* helpers)
  sidebar: 'sidebar',
  sidebarToggle: 'sidebar-toggle',
  sidebarCollapse: 'sidebar-collapse',
  sidebarNewNotebook: 'sidebar-new-notebook',
  sidebarPath: 'sidebar-path',
  sidebarRetry: 'sidebar-retry',
  renameInput: 'rename-input',
  breadcrumb: 'breadcrumb',

  // Help, toast, hints
  helpButton: 'help-button',
  helpDialog: 'help-dialog',
  helpClose: 'help-close',
  toast: 'toast',
  welcomeHint: 'welcome-hint',
  hintBar: 'hint-bar',

  // Pen tray (pen chips use tidPenSlot, colours and sizes tidPenColor / tidPenSize)
  penTray: 'pen-tray',
  penEraser: 'pen-eraser',
  penLasso: 'pen-lasso',
  penOptions: 'pen-options',
  penSwapButtons: 'pen-swap-buttons',
} as const;

/** Toolbar button for a ToolId, e.g. 'tool-rectangle'. Active state: aria-pressed="true". */
export const tidTool = (tool: string): string => `tool-${tool}`;
/** Stroke swatch by index into STROKE_COLORS. */
export const tidStroke = (index: number): string => `style-stroke-${index}`;
/** Background swatch by index into BACKGROUND_COLORS (0 = transparent). */
export const tidBg = (index: number): string => `style-bg-${index}`;
/** 'hachure' | 'cross-hatch' | 'solid' */
export const tidFill = (fill: string): string => `style-fill-${fill}`;
/** 1 | 2 | 4 */
export const tidWidth = (width: number): string => `style-width-${width}`;
/** 'solid' | 'dashed' | 'dotted' */
export const tidStrokeStyle = (style: string): string => `style-strokestyle-${style}`;
/** 0 | 1 | 2 */
export const tidRoughness = (level: number): string => `style-roughness-${level}`;
/** 'sharp' | 'round' */
export const tidEdges = (edges: string): string => `style-edges-${edges}`;
/** 16 | 24 | 32 | 48 */
export const tidFontSize = (size: number): string => `style-fontsize-${size}`;
/** 'hand' | 'sans' | 'mono' */
export const tidFont = (family: string): string => `style-font-${family}`;
/** 'left' | 'center' | 'right' */
export const tidAlign = (align: string): string => `style-align-${align}`;
/** 'none' | 'arrow' | 'triangle' */
export const tidStartHead = (head: string): string => `style-starthead-${head}`;
/** 'none' | 'arrow' | 'triangle' */
export const tidEndHead = (head: string): string => `style-endhead-${head}`;
/** Sidebar rows. Keys: `nb:<name>`, `sec:<nb>/<sec>`, `page:<id>`. */
export const tidNotebook = (nb: string): string => `sidebar-nb-${nb}`;
export const tidSection = (nb: string, sec: string): string => `sidebar-sec-${nb}/${sec}`;
export const tidPage = (id: string): string => `sidebar-page-${id}`;
/** The ⋯ button of a row. */
export const tidRowMenu = (key: string): string => `row-menu-${key}`;
export const tidRowRename = (key: string): string => `row-rename-${key}`;
/** First click shows "Confirm", second click (within DELETE_CONFIRM_MS) deletes. */
export const tidRowDelete = (key: string): string => `row-delete-${key}`;
/** The + button of a notebook (adds a section) or section (adds a page). */
export const tidRowAdd = (key: string): string => `row-add-${key}`;
/** Pen size button in the style panel (ink selected), by index into PEN_SIZES. */
export const tidInkSize = (index: number): string => `style-inksize-${index}`;
/** Pen tray (v3): the tray, its 3 pen chips, the eraser and lasso chips, and the options popover. */
export const tidPenSlot = (index: number): string => `pen-slot-${index}`;
/** Colour swatch in the pen options, by index into PEN_COLORS. */
export const tidPenColor = (index: number): string => `pen-color-${index}`;
/** Size button in the pen options, by index into PEN_SIZES. */
export const tidPenSize = (index: number): string => `pen-size-${index}`;
/** Slash menu rows: the command id ('text', 'h1', 'table', 'newpage', ...). */
export const tidSlashItem = (id: string): string => `slash-item-${id}`;
/** Table toolbar buttons: 'row-above' | 'row-below' | 'col-left' | 'col-right' | 'delete-row' | 'delete-col' | 'delete-table'. */
export const tidTableAction = (action: string): string => `table-action-${action}`;
/** Page picker rows: the page id. */
export const tidPageItem = (id: string): string => `page-item-${id}`;
