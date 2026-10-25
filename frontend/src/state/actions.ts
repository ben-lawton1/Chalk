// Command entry points for UI, keyboard, clipboard and tools: one undo entry per command (WP3).
import type { ChalkElement, Point, ReorderDir, ShapeKind, Size, Snapshot, Style, ToolId, Viewport } from '../types';
import { DUPLICATE_OFFSET, FIT_MAX_ZOOM, FIT_PADDING_PX, ZOOM_STEP_FACTOR } from '../constants';
import { SHAPES } from '../core/shapes';
import { lineHeightPx, withMeasuredText } from '../core/text';
import { fitToBounds, screenToWorld, viewportCenter, zoomAt } from '../core/viewport';
import { getCommonBounds } from '../core/geometry';
import { updateBoundArrows } from '../core/binding';
import {
  addElements, applyStyleToElements, cloneWithNewIds, createShape, createText, duplicateElements, fitShapeToLabel,
  getElement, getElementText, moveElements, removeElements, reorderElements, setElementText,
} from '../core/scene';
import { parseSceneFile, toSceneFile } from '../core/serialize';
import {
  getLastPointerWorld, getSelectedElements, getState, setElements, setInteraction, setSelection, setState, setViewport,
} from './store';
import { historyRedo, historyUndo, pushUndo, takeSnapshot } from './history';

/** In-app clipboard (fallback when the DOM clipboard event carries nothing usable). */
let clipboardBuffer: string | null = null;

// ---------------------------------------------------------------------------
// Tools and selection
// ---------------------------------------------------------------------------

export function setTool(tool: ToolId): void {
  commitEditing();
  setState({ tool });
  // Written inline: state/* may not import tools/* (§4.2). Drawing tools = everything but select and hand.
  if (tool !== 'select' && tool !== 'hand') setSelection([]);
  setInteraction({ hoverId: null, bindTarget: null, cursor: null, dropPreview: null });
}

export function toggleToolLock(): void {
  setState({ toolLocked: !getState().toolLocked });
}

export function finishCreation(): void {
  if (!getState().toolLocked) setTool('select');
}

export function selectAll(): void {
  commitEditing();
  if (getState().tool !== 'select') setTool('select');
  setSelection(getState().elements.map((e) => e.id));
}

export function clearSelection(): void {
  setSelection([]);
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

export function deleteSelection(): void {
  commitEditing();
  const s = getState();
  if (s.selectedIds.length === 0) return;
  const before = takeSnapshot();
  setElements(removeElements(s.elements, s.selectedIds));
  setSelection([]);
  pushUndo(before);
  setInteraction({ hoverId: null, bindTarget: null });
}

export function duplicateSelection(): void {
  commitEditing();
  const s = getState();
  if (s.selectedIds.length === 0) return;
  const before = takeSnapshot();
  const dup = duplicateElements(s.elements, s.selectedIds, { x: DUPLICATE_OFFSET, y: DUPLICATE_OFFSET });
  setElements(dup.elements);
  setSelection(dup.newIds);
  pushUndo(before);
}

export function copySelection(): string | null {
  const selected = getSelectedElements();
  if (selected.length === 0) return null;
  const buffer = JSON.stringify(toSceneFile(selected));
  clipboardBuffer = buffer;
  return buffer;
}

export function cutSelection(): string | null {
  const buffer = copySelection();
  if (buffer !== null) deleteSelection();
  return buffer;
}

function pasteAnchor(): Point {
  const last = getLastPointerWorld();
  if (last) return last;
  const s = getState();
  return screenToWorld(viewportCenter(viewSize()), s.viewport);
}

export function pasteText(text: string): boolean {
  commitEditing();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (parsed !== null && typeof parsed === 'object' && (parsed as { type?: unknown }).type === 'chalk/scene') {
    let els: ChalkElement[];
    try {
      els = parseSceneFile(parsed);
    } catch {
      return false;
    }
    if (els.length === 0) return false;
    const bounds = getCommonBounds(els);
    const last = getLastPointerWorld();
    const offset: Point = last && bounds
      ? { x: last.x - (bounds.x + bounds.width / 2), y: last.y - (bounds.y + bounds.height / 2) }
      : { x: DUPLICATE_OFFSET, y: DUPLICATE_OFFSET };
    const clones = cloneWithNewIds(els, offset);
    const before = takeSnapshot();
    setElements(addElements(getState().elements, clones));
    setSelection(clones.map((c) => c.id));
    pushUndo(before);
    return true;
  }
  if (text.trim() !== '') {
    const style = getState().currentStyle;
    const at = pasteAnchor();
    const before = takeSnapshot();
    const el = createText({ x: at.x, y: at.y - lineHeightPx(style.fontSize) / 2 }, text.replace(/\r\n?/g, '\n'), style);
    setElements(addElements(getState().elements, [el]));
    setSelection([el.id]);
    pushUndo(before);
    return true;
  }
  return false;
}

export function pasteClipboard(): boolean {
  return clipboardBuffer ? pasteText(clipboardBuffer) : false;
}

export function nudgeSelection(dx: number, dy: number): void {
  commitEditing();
  const s = getState();
  if (s.selectedIds.length === 0) return;
  const before = takeSnapshot();
  setElements(moveElements(s.elements, s.selectedIds, dx, dy));
  pushUndo(before, 'nudge');
}

export function reorderSelection(dir: ReorderDir): void {
  commitEditing();
  const s = getState();
  if (s.selectedIds.length === 0) return;
  const before = takeSnapshot();
  setElements(reorderElements(s.elements, s.selectedIds, dir));
  pushUndo(before);
}

export function applyStyle(patch: Partial<Style>, mergeKey?: string): void {
  const s = getState();
  if (s.editing) {
    // Editing continues; the commit's single undo step covers this change too.
    setState({ currentStyle: { ...s.currentStyle, ...patch } });
    if (s.selectedIds.length > 0) setElements(applyStyleToElements(getState().elements, s.selectedIds, patch));
    return;
  }
  const before = takeSnapshot();
  setState({ currentStyle: { ...s.currentStyle, ...patch } });
  if (s.selectedIds.length > 0) setElements(applyStyleToElements(getState().elements, s.selectedIds, patch));
  pushUndo(before, mergeKey);
}

export function placeShape(kind: ShapeKind, screen: Point): string {
  commitEditing();
  const s = getState();
  const before = takeSnapshot();
  const world = screenToWorld(screen, s.viewport);
  const size = SHAPES[kind].defaultSize;
  const el = createShape(
    kind,
    { x: world.x - size.width / 2, y: world.y - size.height / 2, width: size.width, height: size.height },
    s.currentStyle,
  );
  setElements(addElements(s.elements, [el]));
  setSelection([el.id]);
  pushUndo(before);
  finishCreation();
  return el.id;
}

export function replaceScene(elements: readonly ChalkElement[]): void {
  commitEditing();
  const before = takeSnapshot();
  setElements(elements);
  setSelection([]);
  pushUndo(before);
  setInteraction({ hoverId: null, bindTarget: null });
  zoomToFit();
}

// ---------------------------------------------------------------------------
// Text editing lifecycle (§13.2, §13.3)
// ---------------------------------------------------------------------------

export function startEditing(id: string, before?: Snapshot): void {
  const cur = getState().editing;
  if (cur && cur.id !== id) commitEditing();
  else if (cur) return;
  if (!getElement(getState().elements, id)) return;
  const snap = before ?? takeSnapshot();
  setState({ editing: { id, before: snap }, selectedIds: [id] });
  setInteraction({ hoverId: null });
}

export function createTextAt(world: Point): string {
  commitEditing();
  const s = getState();
  const before = takeSnapshot();
  const el = createText({ x: world.x, y: world.y - lineHeightPx(s.currentStyle.fontSize) / 2 }, '', s.currentStyle);
  setElements(addElements(s.elements, [el]));
  startEditing(el.id, before);
  return el.id;
}

export function updateEditingText(text: string): void {
  const editing = getState().editing;
  if (!editing) return;
  setElements(setElementText(getState().elements, editing.id, text));
}

export function commitEditing(): void {
  const editing = getState().editing;
  if (!editing) return;
  const { id, before } = editing;
  setState({ editing: null }); // FIRST, so a blur-on-unmount re-entry is a no-op
  const elements = getState().elements;
  const el = getElement(elements, id);
  if (el?.type === 'text' && el.text.trim() === '') {
    setElements(removeElements(elements, [id]));
    setSelection([]);
  } else if (el && el.type !== 'text' && getElementText(el) !== getElementText(el).trimEnd()) {
    setElements(setElementText(elements, id, getElementText(el).trimEnd()));
    setSelection([id]);
  } else if (el) {
    setSelection([id]);
  }
  pushUndo(before);
  if (getState().tool === 'text') finishCreation();
}

export function editSelection(): boolean {
  commitEditing();
  const sel = getState().selectedIds;
  if (sel.length !== 1) return false;
  if (!getElement(getState().elements, sel[0]!)) return false;
  startEditing(sel[0]!);
  return true;
}

// ---------------------------------------------------------------------------
// Undo / redo
// ---------------------------------------------------------------------------

export function undo(): void {
  const s = getState();
  if (s.editing || s.interaction.gestureActive) return;
  historyUndo();
  setInteraction({ hoverId: null, bindTarget: null });
}

export function redo(): void {
  const s = getState();
  if (s.editing || s.interaction.gestureActive) return;
  historyRedo();
  setInteraction({ hoverId: null, bindTarget: null });
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

function viewSize(): Size {
  const size = getState().viewportSize;
  if (size.width === 0 && typeof window !== 'undefined') return { width: window.innerWidth, height: window.innerHeight };
  return size;
}

function zoomAbout(target: (v: Viewport) => number): void {
  const v = getState().viewport;
  setViewport(zoomAt(v, target(v), viewportCenter(viewSize())));
}

export function zoomIn(): void {
  zoomAbout((v) => v.zoom * ZOOM_STEP_FACTOR);
}

export function zoomOut(): void {
  zoomAbout((v) => v.zoom / ZOOM_STEP_FACTOR);
}

export function resetZoom(): void {
  zoomAbout(() => 1);
}

export function zoomToFit(opts?: { maxZoom?: number }): void {
  const bounds = getCommonBounds(getState().elements);
  setViewport(fitToBounds(bounds, viewSize(), { padding: FIT_PADDING_PX, maxZoom: opts?.maxZoom ?? FIT_MAX_ZOOM }));
}

export function zoomToSelection(): void {
  const sel = getSelectedElements();
  if (sel.length === 0) {
    zoomToFit();
    return;
  }
  setViewport(fitToBounds(getCommonBounds(sel), viewSize(), { padding: FIT_PADDING_PX, maxZoom: FIT_MAX_ZOOM }));
}

// ---------------------------------------------------------------------------
// Dialogs and font loading
// ---------------------------------------------------------------------------

export function openDialog(d: 'boards' | 'help'): void {
  commitEditing();
  setState({ dialog: d });
}

export function closeDialog(): void {
  setState({ dialog: 'none' });
}

export function remeasureText(): void {
  const elements = getState().elements;
  let changed = false;
  const next = elements.map((el) => {
    let out: ChalkElement = el;
    if (el.type === 'text') out = withMeasuredText(el);
    else if (el.type === 'shape' && el.label !== '') out = fitShapeToLabel(el);
    if (out !== el) changed = true;
    return out;
  });
  if (changed) setElements(updateBoundArrows(next, null));
}
