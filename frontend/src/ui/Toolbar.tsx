// Tool palette (hand, select, shapes, arrow, line, text, lock) with pointer-event drag-from-palette. Owner: WP4.
import { Fragment, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { PALETTE_DRAG_THRESHOLD_PX } from '../constants';
import { SHAPES, isShapeKind } from '../core/shapes';
import { screenToWorld } from '../core/viewport';
import { placeShape, setTool, toggleToolLock } from '../state/actions';
import { getState, setInteraction } from '../state/store';
import { TOOLBAR, TOOL_INFO } from '../tools/index';
import { TID, tidTool } from '../testids';
import type { Point, ShapeKind, ToolId } from '../types';
import { useAppState } from './hooks';
import { Icon, ToolIcon } from './icons';

interface DragRecord {
  kind: ShapeKind;
  startX: number;
  startY: number;
  dragging: boolean;
  button: HTMLElement;
}

/** "R or 2" style key list for tooltips; the first digit shortcut is the small hint on the button. */
function keyLabel(shortcuts: readonly string[]): string {
  return shortcuts.map((k) => k.toUpperCase()).join(' or ');
}
function digitHint(shortcuts: readonly string[]): string | null {
  return shortcuts.find((k) => /^[0-9]$/.test(k)) ?? null;
}

function canvasEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="canvas-interactive"]');
}
/** Is this client point over the interactive canvas? Returns its screen (canvas CSS px) position if so. */
function canvasScreenPoint(clientX: number, clientY: number): Point | null {
  const over = document.elementFromPoint(clientX, clientY)?.getAttribute('data-testid') === TID.canvasInteractive;
  if (!over) return null;
  const canvas = canvasEl();
  if (!canvas) return null;
  const r = canvas.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
}

export function Toolbar() {
  const tool = useAppState((s) => s.tool);
  const toolLocked = useAppState((s) => s.toolLocked);
  const [ghost, setGhost] = useState<{ x: number; y: number; kind: ShapeKind } | null>(null);
  const record = useRef<DragRecord | null>(null);
  const suppressClick = useRef(false);
  const escListener = useRef<((e: KeyboardEvent) => void) | null>(null);

  function removeEscape(): void {
    if (escListener.current) {
      window.removeEventListener('keydown', escListener.current, true);
      escListener.current = null;
    }
  }

  /** The "finish" procedure of spec section 12. Safe to call repeatedly. */
  function finish(): void {
    const r = record.current;
    if (!r) return;
    setInteraction({ dropPreview: null });
    setGhost(null);
    removeEscape();
    r.button.style.cursor = '';
    suppressClick.current = r.dragging;
    record.current = null;
  }

  // Never leave a capture-phase listener or a preview behind if the toolbar unmounts mid-drag.
  useEffect(() => () => {
    removeEscape();
    if (record.current) setInteraction({ dropPreview: null });
    record.current = null;
  }, []);

  function onPointerDown(e: ReactPointerEvent<HTMLButtonElement>, kind: ShapeKind): void {
    if (e.button !== 0) return;
    suppressClick.current = false;
    record.current = { kind, startX: e.clientX, startY: e.clientY, dragging: false, button: e.currentTarget };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // synthetic pointers can refuse capture; the drag still works while the pointer stays over the button
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLButtonElement>): void {
    const r = record.current;
    if (!r) return;
    if (!r.dragging) {
      if (Math.hypot(e.clientX - r.startX, e.clientY - r.startY) <= PALETTE_DRAG_THRESHOLD_PX) return;
      r.dragging = true;
      r.button.style.cursor = 'grabbing';
      const onEsc = (ev: KeyboardEvent): void => {
        if (ev.key !== 'Escape') return;
        ev.preventDefault();
        ev.stopPropagation();
        finish();
      };
      escListener.current = onEsc;
      window.addEventListener('keydown', onEsc, true);
    }
    const screen = canvasScreenPoint(e.clientX, e.clientY);
    if (screen) {
      setGhost(null);
      const world = screenToWorld(screen, getState().viewport);
      const size = SHAPES[r.kind].defaultSize;
      setInteraction({
        dropPreview: {
          kind: r.kind,
          rect: { x: world.x - size.width / 2, y: world.y - size.height / 2, width: size.width, height: size.height },
        },
      });
    } else {
      setInteraction({ dropPreview: null });
      setGhost({ x: e.clientX, y: e.clientY, kind: r.kind });
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLButtonElement>): void {
    const r = record.current;
    if (!r) return;
    try {
      if (r.dragging) {
        const screen = canvasScreenPoint(e.clientX, e.clientY);
        if (screen) placeShape(r.kind, screen);
      }
    } catch (err) {
      console.error(err);
    } finally {
      finish();
    }
  }

  function onClick(id: ToolId): void {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setTool(id);
  }

  return (
    <>
      <div className="island toolbar" role="toolbar" aria-label="Tools">
        {TOOLBAR.map((id, i) => {
          const info = TOOL_INFO[id];
          const draggable = isShapeKind(id);
          const hint = digitHint(info.shortcuts);
          const prev = i > 0 ? TOOLBAR[i - 1] : null;
          // visual groups: [hand, select] | shapes | [arrow, line, text]
          const sep = prev !== null && (id === 'rectangle' || id === 'arrow');
          return (
            <Fragment key={id}>
              {sep && <span className="toolbar-sep" aria-hidden="true" />}
              <button
                type="button"
                className="tool-btn"
                data-testid={tidTool(id)}
                aria-pressed={tool === id}
                aria-label={info.title}
                title={`${info.title} — ${keyLabel(info.shortcuts)}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onClick(id)}
                {...(draggable
                  ? {
                      onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => onPointerDown(e, id as ShapeKind),
                      onPointerMove,
                      onPointerUp,
                      onPointerCancel: finish,
                      onLostPointerCapture: finish,
                    }
                  : {})}
              >
                <ToolIcon tool={id} size={20} />
                {hint && <span className="tool-hint">{hint}</span>}
              </button>
            </Fragment>
          );
        })}
        <span className="toolbar-sep" aria-hidden="true" />
        <button
          type="button"
          className="tool-btn"
          data-testid={TID.toolLock}
          aria-pressed={toolLocked}
          aria-label="Keep the selected tool active after drawing"
          title="Keep the tool after drawing — Q"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => toggleToolLock()}
        >
          <Icon name={toolLocked ? 'lock' : 'unlock'} size={20} />
        </button>
      </div>
      {ghost &&
        createPortal(
          <div
            className="drag-ghost"
            data-testid={TID.dragGhost}
            style={{ left: ghost.x - 24, top: ghost.y - 24 }}
          >
            <ToolIcon tool={ghost.kind} size={26} />
          </div>,
          document.body,
        )}
    </>
  );
}
