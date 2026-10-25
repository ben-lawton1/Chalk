// In-place text editor overlay: a scaled textarea that coincides with the canvas text of the edited element. Owner: WP4.
import { useEffect, useRef } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ARROW_LABEL_MAX_WIDTH, FONT_STACKS, LINE_HEIGHT } from '../constants';
import { getElementText } from '../core/scene';
import { layoutForEditing, lineHeightPx } from '../core/text';
import { worldToScreen } from '../core/viewport';
import { handleKeyDown } from '../input/keyboard';
import { handleWheel } from '../input/pointer';
import { commitEditing, updateEditingText } from '../state/actions';
import { TID } from '../testids';
import type { ChalkElement, TextAlign, Viewport } from '../types';
import { useAppState } from './hooks';

interface EditorGeometry {
  /** World px. */
  left: number;
  top: number;
  width: number;
  height: number;
  wrapping: boolean;
  align: TextAlign;
}

/** Spec section 13.3 layout table. */
function editorGeometry(el: ChalkElement): EditorGeometry {
  const layout = layoutForEditing(el);
  const fs = el.style.fontSize;
  const lh = lineHeightPx(fs);
  const top = layout.y;
  const height = Math.max(layout.height, lh) + 1;
  if (el.type === 'text') {
    const align = el.style.textAlign;
    if (el.autoResize) {
      const shift = align === 'left' ? 0 : align === 'center' ? fs / 2 : fs;
      return { left: layout.x - shift, top, width: layout.width + fs, height, wrapping: false, align };
    }
    return { left: layout.x, top, width: el.width, height, wrapping: true, align };
  }
  if (el.type === 'shape') {
    return { left: layout.x, top, width: layout.width, height, wrapping: true, align: 'center' };
  }
  const multiline = layout.lines.length > 1;
  const width = multiline ? ARROW_LABEL_MAX_WIDTH : layout.width + fs;
  return { left: (el.start.x + el.end.x) / 2 - width / 2, top, width, height, wrapping: multiline, align: 'center' };
}

function Editor(props: { el: ChalkElement; viewport: Viewport }) {
  const { el, viewport } = props;
  const ref = useRef<HTMLTextAreaElement>(null);

  // Focus on mount (the component is keyed by the edited id), again after the next frame.
  useEffect(() => {
    const focus = (): void => {
      const ta = ref.current;
      if (!ta) return;
      ta.focus();
      const n = ta.value.length;
      ta.setSelectionRange(n, n);
    };
    focus();
    const raf = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Wheel pans / zooms while the pointer is over the editor (React's onWheel is passive).
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.addEventListener('wheel', handleWheel, { passive: false });
    return () => ta.removeEventListener('wheel', handleWheel);
  }, []);

  const g = editorGeometry(el);
  const z = viewport.zoom;
  const origin = worldToScreen({ x: g.left, y: g.top }, viewport);
  const style: CSSProperties = {
    left: origin.x,
    top: origin.y,
    width: g.width,
    height: g.height,
    transform: `scale(${z})`,
    transformOrigin: '0 0',
    fontFamily: FONT_STACKS[el.style.fontFamily],
    fontSize: `${el.style.fontSize}px`,
    fontWeight: 400,
    fontStyle: 'normal',
    lineHeight: String(LINE_HEIGHT),
    textAlign: g.align,
    color: el.style.strokeColor,
    opacity: el.style.opacity / 100,
    whiteSpace: g.wrapping ? 'pre-wrap' : 'pre',
    overflowWrap: g.wrapping ? 'break-word' : 'normal',
    wordBreak: g.wrapping ? 'break-word' : 'normal',
  };

  function onKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    e.stopPropagation();
    if (handleKeyDown(e.nativeEvent)) {
      e.preventDefault();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      commitEditing();
      return;
    }
    if (mod && e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      commitEditing();
    }
  }

  return (
    <textarea
      ref={ref}
      className="text-editor"
      data-testid={TID.textEditor}
      data-editing-id={el.id}
      dir="auto"
      spellCheck={false}
      rows={1}
      wrap={g.wrapping ? 'soft' : 'off'}
      value={getElementText(el)}
      style={style}
      onChange={(e) => updateEditingText(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => {
        if (!document.hasFocus()) return;
        commitEditing();
      }}
    />
  );
}

export function TextEditor() {
  const el = useAppState((s) => (s.editing ? s.elements.find((e) => e.id === s.editing!.id) : undefined));
  const viewport = useAppState((s) => s.viewport);
  if (!el) return null;
  return <Editor key={el.id} el={el} viewport={viewport} />;
}
