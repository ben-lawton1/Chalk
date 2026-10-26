// Onboarding hints: welcome message on empty boards, contextual hint bar, and the scroll-to-content button. Owner: WP4.
import { rectsIntersect } from '../core/math';
import { getBounds } from '../core/geometry';
import { isNotesEmpty } from '../core/notes';
import { visibleWorldRect } from '../core/viewport';
import { zoomToFit } from '../state/actions';
import { TID } from '../testids';
import type { AppState, ChalkElement, NotesDoc, Rect, Size, Viewport } from '../types';
import { useAppState } from './hooks';
import { Icon } from './icons';

function hintFor(s: AppState): string {
  if (s.editing) return 'Esc or Ctrl+Enter to finish';
  switch (s.tool) {
    case 'select':
      return s.selectedIds.length > 0
        ? 'Drag to move · Handles resize · Double-click to edit text · Delete removes'
        : 'Drag shapes from the toolbar · Double-click to add text · Space + drag to pan';
    case 'hand':
      return 'Drag to pan · Ctrl + wheel to zoom';
    case 'arrow':
    case 'line':
      return 'Drag from one shape to another to connect them · Ctrl to avoid connecting';
    case 'text':
      return 'Click anywhere to type';
    case 'pen':
      return 'Draw with the pen · Eraser button erases · Barrel button lassos · Finger drags to pan';
    case 'eraser':
      return 'Drag across things to erase them · Ctrl+Z brings them back';
    case 'lasso':
      return 'Draw a loop around things to select them';
    default:
      return 'Click and drag to draw · Shift for a square · Alt from the center';
  }
}

let memo: { els: readonly ChalkElement[]; notes: NotesDoc | null; nb: Rect | null; vp: Viewport; size: Size; result: boolean } | null = null;
/** True when there is content (elements, or a non-empty notes column) but none of it intersects the visible world rect. Memoized: it runs on every store change. */
function contentIsOffscreen(s: AppState): boolean {
  const hasNotes = s.notesBounds !== null && !isNotesEmpty(s.notes);
  if ((s.elements.length === 0 && !hasNotes) || s.viewportSize.width <= 0 || s.viewportSize.height <= 0) return false;
  if (memo && memo.els === s.elements && memo.notes === s.notes && memo.nb === s.notesBounds && memo.vp === s.viewport && memo.size === s.viewportSize) return memo.result;
  let result = false;
  try {
    const visible = visibleWorldRect(s.viewport, s.viewportSize);
    result = !s.elements.some((el) => rectsIntersect(getBounds(el), visible)) && !(hasNotes && rectsIntersect(s.notesBounds!, visible));
  } catch {
    result = false;
  }
  memo = { els: s.elements, notes: s.notes, nb: s.notesBounds, vp: s.viewport, size: s.viewportSize, result };
  return result;
}

function WelcomeHint() {
  const show = useAppState((s) => s.board !== null && s.saveStatus !== 'loading' && s.elements.length === 0);
  if (!show) return null;
  return (
    <div className="welcome-hint" data-testid={TID.welcomeHint}>
      <span>Drag a shape from the toolbar — or press R and drag.</span>{' '}
      <span>Double-click anywhere to write.</span>{' '}
      <span>Press ? for all shortcuts.</span>
    </div>
  );
}

function HintBar() {
  const text = useAppState(hintFor);
  return (
    <div className="hint-bar" data-testid={TID.hintBar}>
      {text}
    </div>
  );
}

function ScrollToContent() {
  const show = useAppState(contentIsOffscreen);
  if (!show) return null;
  return (
    <button
      type="button"
      className="scroll-to-content"
      data-testid={TID.scrollToContent}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => zoomToFit({ maxZoom: 1 })}
    >
      <Icon name="fit" size={16} />
      Back to content
    </button>
  );
}

export function Hints() {
  return (
    <>
      <WelcomeHint />
      <HintBar />
      <ScrollToContent />
    </>
  );
}
