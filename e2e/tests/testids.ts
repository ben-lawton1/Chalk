/**
 * data-testid contract shared by the UI (WP4) and the Playwright suite (WP6).
 *
 * FROZEN after WP0. A byte-identical copy lives at e2e/tests/testids.ts.
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
  undo: 'undo',
  redo: 'redo',
  scrollToContent: 'scroll-to-content',

  // Main menu
  menuButton: 'menu-button',
  menuNewBoard: 'menu-new-board',
  menuOpenBoards: 'menu-open-boards',
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

  // Boards dialog (rows use tidBoardRow / tidBoardOpen / tidBoardDelete)
  boardList: 'board-list',
  boardListNew: 'board-list-new',
  boardListClose: 'board-list-close',

  // Help, toast, hints
  helpButton: 'help-button',
  helpDialog: 'help-dialog',
  helpClose: 'help-close',
  toast: 'toast',
  welcomeHint: 'welcome-hint',
  hintBar: 'hint-bar',
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
/** Row of a board in the boards dialog. */
export const tidBoardRow = (id: string): string => `board-row-${id}`;
export const tidBoardOpen = (id: string): string => `board-open-${id}`;
/** First click shows "Confirm", second click (within DELETE_CONFIRM_MS) deletes. */
export const tidBoardDelete = (id: string): string => `board-delete-${id}`;
