// Clipboard: DOM copy/cut/paste events plus Ctrl+C/X/V keydown fallback onto an in-app buffer (WP3).
import { PASTE_FALLBACK_MS } from '../constants';
import { getState } from '../state/store';
import { copySelection, cutSelection, pasteClipboard, pasteText } from '../state/actions';
import { isTextEntry } from './pointer';

let detachCurrent: (() => void) | null = null;

export function attachClipboard(): () => void {
  if (detachCurrent) detachCurrent();

  let pendingCut = false;
  let pendingPaste = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  /** Native behaviour while typing, editing, or mid-gesture. */
  const ignored = (target: EventTarget | null): boolean =>
    isTextEntry(target) || getState().editing !== null || getState().interaction.gestureActive;

  const later = (fn: () => void): void => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, PASTE_FALLBACK_MS);
    timers.add(id);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (ignored(e.target)) return;
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    const k = e.key.toLowerCase();
    // Never preventDefault here: that would suppress the DOM clipboard events.
    if (k === 'c') copySelection();
    else if (k === 'x') {
      pendingCut = true;
      later(() => {
        if (pendingCut) {
          pendingCut = false;
          cutSelection();
        }
      });
    } else if (k === 'v') {
      pendingPaste = true;
      later(() => {
        if (pendingPaste) {
          pendingPaste = false;
          pasteClipboard();
        }
      });
    }
  };
  const onCopy = (e: ClipboardEvent): void => {
    if (ignored(e.target)) return;
    const s = copySelection();
    if (s) {
      e.clipboardData?.setData('text/plain', s);
      e.preventDefault();
    }
  };
  const onCut = (e: ClipboardEvent): void => {
    if (ignored(e.target)) return;
    pendingCut = false;
    const s = cutSelection();
    if (s) {
      e.clipboardData?.setData('text/plain', s);
      e.preventDefault();
    }
  };
  const onPaste = (e: ClipboardEvent): void => {
    if (ignored(e.target)) return;
    pendingPaste = false;
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!pasteText(text)) pasteClipboard();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('copy', onCopy);
  window.addEventListener('cut', onCut);
  window.addEventListener('paste', onPaste);

  let detached = false;
  const detach = (): void => {
    if (detached) return;
    detached = true;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('copy', onCopy);
    window.removeEventListener('cut', onCut);
    window.removeEventListener('paste', onPaste);
    for (const id of timers) clearTimeout(id);
    timers.clear();
    pendingCut = false;
    pendingPaste = false;
    if (detachCurrent === detach) detachCurrent = null;
  };
  detachCurrent = detach;
  return detach;
}
