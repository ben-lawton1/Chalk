// Keyboard shortcuts (guard order of §16.1) and the SHORTCUTS table rendered by the help dialog (WP3).
import type { ShortcutInfo } from '../types';
import { NUDGE, NUDGE_SHIFT } from '../constants';
import { toolForKey } from '../tools';
import { getState, notify } from '../state/store';
import {
  clearSelection, closeDialog, deleteSelection, duplicateSelection, editSelection, nudgeSelection, openDialog, redo,
  reorderSelection, resetZoom, selectAll, setTool, toggleToolLock, undo, zoomIn, zoomOut, zoomToFit, zoomToSelection,
} from '../state/actions';
import { flushSave } from '../persistence/autosave';
import { cancelGesture, isTextEntry } from './pointer';

export type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'repeat'> & { target: EventTarget | null };

const ARROW_DELTAS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function saveNow(): void {
  let p: Promise<void>;
  try {
    p = flushSave();
  } catch {
    notify('Save failed', 'error');
    return;
  }
  p.then(() => notify('Saved')).catch(() => notify('Save failed', 'error'));
}

/** Returns true if the key was handled (the caller then preventDefault()s). */
export function handleKeyDown(e: KeyLike): boolean {
  const mod = e.ctrlKey || e.metaKey;
  const code = e.code ?? '';
  const lower = (e.key ?? '').toLowerCase();
  const s0 = getState();

  // 0. Save and zoom combos run before every guard (also while typing).
  if (mod && !e.altKey) {
    const isSave = lower === 's';
    const isIn = code === 'Equal' || code === 'NumpadAdd';
    const isOut = code === 'Minus' || code === 'NumpadSubtract';
    const isReset = code === 'Digit0' || code === 'Numpad0';
    if (isSave || isIn || isOut || isReset) {
      if (s0.interaction.gestureActive) return true;
      if (isSave) saveNow();
      else if (isIn) zoomIn();
      else if (isOut) zoomOut();
      else resetZoom();
      return true;
    }
  }

  // 1-2. Typing targets and the text editor keep their keys.
  if (isTextEntry(e.target)) return false;
  if (s0.editing) return false;

  // 3. Dialogs: only Escape.
  if (s0.dialog !== 'none') {
    if (e.key === 'Escape') {
      closeDialog();
      return true;
    }
    return false;
  }

  // 4. Escape, and no commands during a gesture.
  if (e.key === 'Escape') {
    if (s0.interaction.gestureActive) cancelGesture();
    else if (s0.selectedIds.length > 0) clearSelection();
    else setTool('select');
    return true;
  }
  if (s0.interaction.gestureActive) return mod;

  // 5. Ctrl/Cmd combos.
  if (mod) {
    if (lower === 'z') {
      if (e.shiftKey) redo();
      else undo();
      return true;
    }
    if (lower === 'y') {
      redo();
      return true;
    }
    if (lower === 'd') {
      if (!e.repeat) duplicateSelection();
      return true;
    }
    if (lower === 'a') {
      selectAll();
      return true;
    }
    if (code === 'BracketRight') {
      reorderSelection(e.shiftKey ? 'front' : 'forward');
      return true;
    }
    if (code === 'BracketLeft') {
      reorderSelection(e.shiftKey ? 'back' : 'backward');
      return true;
    }
    // c / x / v fall through to the native clipboard events; anything else belongs to the browser.
    return false;
  }

  // 6. Shifted keys (no mod).
  if (e.shiftKey) {
    if (e.key === '?') {
      openDialog('help');
      return true;
    }
    if (code === 'Digit1') {
      zoomToFit();
      return true;
    }
    if (code === 'Digit2') {
      zoomToSelection();
      return true;
    }
    const d = ARROW_DELTAS[e.key];
    if (d && !e.altKey) {
      nudgeSelection(d[0] * NUDGE_SHIFT, d[1] * NUDGE_SHIFT);
      return true;
    }
  }

  // 7. Arrow keys.
  if (!e.shiftKey && !e.altKey) {
    const d = ARROW_DELTAS[e.key];
    if (d) {
      nudgeSelection(d[0] * NUDGE, d[1] * NUDGE);
      return true;
    }
  }

  // 8. Delete / Backspace.
  if (e.key === 'Delete' || e.key === 'Backspace') {
    deleteSelection();
    return true;
  }

  // 9. Enter.
  if (e.key === 'Enter') return editSelection();

  // 10. Tool keys: only with no modifier at all.
  if (!e.shiftKey && !e.altKey) {
    const key = code.startsWith('Digit') ? code.slice(5) : lower;
    if (key === 'q') {
      if (!e.repeat) toggleToolLock();
      return true;
    }
    const t = toolForKey(key);
    if (t) {
      setTool(t);
      return true;
    }
  }
  return false;
}

/** Window keydown handler plus the bare-Alt guard; the returned detach is idempotent. */
let detachCurrent: (() => void) | null = null;
export function attachKeyboard(): () => void {
  if (detachCurrent) detachCurrent();
  const onKeyDown = (e: KeyboardEvent): void => {
    if (handleKeyDown(e)) e.preventDefault();
  };
  const onAlt = (e: KeyboardEvent): void => {
    // A bare Alt press would move focus to the browser menu on Windows; Alt is a drawing modifier here.
    if (e.key === 'Alt' && !isTextEntry(e.target)) e.preventDefault();
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keydown', onAlt);
  window.addEventListener('keyup', onAlt);
  let detached = false;
  const detach = (): void => {
    if (detached) return;
    detached = true;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keydown', onAlt);
    window.removeEventListener('keyup', onAlt);
    if (detachCurrent === detach) detachCurrent = null;
  };
  detachCurrent = detach;
  return detach;
}

export const SHORTCUTS: readonly ShortcutInfo[] = [
  { keys: 'V or 1', description: 'Select', group: 'Tools' },
  { keys: 'H', description: 'Hand (pan)', group: 'Tools' },
  { keys: 'R or 2', description: 'Rectangle', group: 'Tools' },
  { keys: 'D or 3', description: 'Diamond', group: 'Tools' },
  { keys: 'O or 4', description: 'Ellipse', group: 'Tools' },
  { keys: '5', description: 'Triangle', group: 'Tools' },
  { keys: 'A or 6', description: 'Arrow', group: 'Tools' },
  { keys: 'L or 7', description: 'Line', group: 'Tools' },
  { keys: 'T or 8', description: 'Text', group: 'Tools' },
  { keys: 'Q', description: 'Keep the tool after drawing (lock)', group: 'Tools' },
  { keys: 'Double-click', description: 'Edit text or label; on empty canvas: new text', group: 'Edit' },
  { keys: 'Enter', description: 'Edit the selected text or label', group: 'Edit' },
  { keys: 'Esc or Ctrl + Enter (while typing)', description: 'Finish editing', group: 'Edit' },
  { keys: 'Delete / Backspace', description: 'Delete', group: 'Edit' },
  { keys: 'Ctrl + D', description: 'Duplicate', group: 'Edit' },
  { keys: 'Alt + drag', description: 'Duplicate while moving', group: 'Edit' },
  { keys: 'Ctrl + C / X / V', description: 'Copy / cut / paste', group: 'Edit' },
  { keys: 'Ctrl + A', description: 'Select all', group: 'Edit' },
  { keys: 'Shift + click', description: 'Add to or remove from selection', group: 'Edit' },
  { keys: 'Arrow keys (Shift)', description: 'Nudge 1 (10)', group: 'Edit' },
  { keys: 'Ctrl + Z', description: 'Undo', group: 'Edit' },
  { keys: 'Ctrl + Shift + Z or Ctrl + Y', description: 'Redo', group: 'Edit' },
  { keys: 'Ctrl + ] / Ctrl + [', description: 'Bring forward / send backward', group: 'Edit' },
  { keys: 'Ctrl + Shift + ] / [', description: 'Bring to front / send to back', group: 'Edit' },
  { keys: 'Shift (drawing)', description: 'Square or circle; arrows snap to 15°', group: 'Edit' },
  { keys: 'Shift (resizing / moving)', description: 'Keep aspect / lock axis', group: 'Edit' },
  { keys: 'Alt (drawing / resizing)', description: 'From the center', group: 'Edit' },
  { keys: 'Alt (starting or releasing an arrow end)', description: 'Anchor at the exact point', group: 'Edit' },
  { keys: 'Ctrl (drawing an arrow)', description: 'Do not connect', group: 'Edit' },
  { keys: 'Esc', description: 'Cancel, clear the selection, then the Select tool', group: 'Edit' },
  { keys: 'Wheel / Shift + wheel', description: 'Pan vertically / horizontally', group: 'View' },
  { keys: 'Space + drag, middle-drag', description: 'Pan', group: 'View' },
  { keys: 'Ctrl + wheel, pinch', description: 'Zoom at the cursor', group: 'View' },
  { keys: 'Ctrl + = / Ctrl + −', description: 'Zoom in / out', group: 'View' },
  { keys: 'Ctrl + 0', description: 'Zoom to 100%', group: 'View' },
  { keys: 'Shift + 1', description: 'Zoom to fit everything', group: 'View' },
  { keys: 'Shift + 2', description: 'Zoom to selection', group: 'View' },
  { keys: 'Ctrl + S', description: 'Save now', group: 'File' },
  { keys: '?', description: 'Show shortcuts', group: 'File' },
];
