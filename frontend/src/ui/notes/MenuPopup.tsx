// A floating panel in a body portal, placed next to an anchor (the caret, or a table) with placePopup: below by default, flipped above near
// the bottom of the stage, clamped to the stage. Menus do not scale with the page zoom. It re-places itself after every render and when
// the viewport moves (the page pans or zooms under an open menu).
import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { placePopup } from '../../core/notesView';
import type { PopupAnchor, PopupBounds, PopupPlacement } from '../../core/notesView';
import { useAppState } from '../hooks';

function stageBounds(): PopupBounds {
  const stage = document.querySelector('.stage');
  const r = stage ? stage.getBoundingClientRect() : null;
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (!r || r.width === 0) return { left: 0, top: 0, right: w, bottom: h };
  return { left: Math.max(0, r.left), top: Math.max(0, r.top), right: Math.min(w, r.right), bottom: Math.min(h, r.bottom) };
}

export function MenuPopup(props: {
  /** The anchor line in client px, or null when it cannot be found (the popup stays hidden). */
  anchor: () => PopupAnchor | null;
  className: string;
  testId: string;
  prefer?: 'below' | 'above';
  children: ReactNode;
}) {
  const { anchor, className, testId, prefer, children } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<PopupPlacement | null>(null);
  const viewport = useAppState((s) => s.viewport);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let a: PopupAnchor | null = null;
    try {
      a = anchor();
    } catch {
      a = null; // the position left the document
    }
    if (!a) return;
    const next = placePopup(a, { width: el.offsetWidth, height: el.scrollHeight + (el.offsetHeight - el.clientHeight) }, stageBounds(), prefer ? { prefer } : {});
    setPlace((prev) =>
      prev && prev.left === next.left && prev.top === next.top && prev.maxHeight === next.maxHeight && prev.placement === next.placement ? prev : next,
    );
  });
  void viewport; // subscribing re-renders (and so re-places) the popup when the page pans or zooms

  const style: CSSProperties = place
    ? { left: place.left, top: place.top, maxHeight: place.maxHeight }
    : { left: 0, top: 0, visibility: 'hidden' };
  return createPortal(
    <div ref={ref} className={`notes-menu ${className}`} data-testid={testId} data-placement={place?.placement ?? ''} style={style}>
      {children}
    </div>,
    document.body,
  );
}
