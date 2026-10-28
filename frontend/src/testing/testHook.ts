// window.__CHALK__ test hook installed in every build (WP0).
import type { ChalkElement, ChalkTestHook, NotesDoc, Point } from '../types';
import { getState } from '../state/store';
import { screenToWorld, worldToScreen } from '../core/viewport';
import { getBounds } from '../core/geometry';
import { notesText } from '../core/notes';
import { flushSave } from '../persistence/autosave';
import { whenRendered } from '../render/canvas';

/** Top-left of the interactive canvas in client px (the open sidebar offsets it); 0,0 if it is not mounted. */
function canvasOrigin(): Point {
  const c = typeof document === 'undefined' ? null : document.querySelector('[data-testid="canvas-interactive"]');
  if (!c) return { x: 0, y: 0 };
  const r = c.getBoundingClientRect();
  return { x: r.left, y: r.top };
}

export function installTestHook(): void {
  if (typeof window === 'undefined') return;
  const hook: ChalkTestHook = {
    version: 1,
    isReady: () => { const s = getState(); return s.board !== null && s.saveStatus !== 'loading'; },
    getElements: () => structuredClone([...getState().elements]) as ChalkElement[],
    getSelectedIds: () => [...getState().selectedIds],
    getNotes: () => { const n = getState().notes; return n ? structuredClone(n) as NotesDoc : null; },
    getNotesText: () => notesText(getState().notes),
    getAppState: () => {
      const s = getState();
      return {
        tool: s.tool, toolLocked: s.toolLocked, viewport: { ...s.viewport }, viewportSize: { ...s.viewportSize },
        editingId: s.editing?.id ?? null, boardId: s.board?.id ?? null, boardName: s.board?.name ?? null,
        boardVersion: s.board?.version ?? null, saveStatus: s.saveStatus, canUndo: s.canUndo, canRedo: s.canRedo,
        dialog: s.dialog,
        pens: s.pens.map((p) => ({ ...p })), activePen: s.activePen, penButtonsSwapped: s.penButtonsSwapped, penTrayOpen: s.penTrayOpen,
        notesActive: s.notesActive,
        interaction: {
          marquee: s.interaction.marquee, bindTargetId: s.interaction.bindTarget?.elementId ?? null,
          hoverId: s.interaction.hoverId, dropPreview: s.interaction.dropPreview, gestureActive: s.interaction.gestureActive,
          lassoActive: s.interaction.lasso !== null, liveInkPoints: s.interaction.liveInk?.points.length ?? 0,
        },
      };
    },
    worldToScreen: (p) => {
      const o = canvasOrigin();
      const q = worldToScreen(p, getState().viewport);
      return { x: q.x + o.x, y: q.y + o.y };
    },
    screenToWorld: (p) => {
      const o = canvasOrigin();
      return screenToWorld({ x: p.x - o.x, y: p.y - o.y }, getState().viewport);
    },
    getElementScreenBounds: (id) => {
      const s = getState();
      const el = s.elements.find((e) => e.id === id);
      if (!el) return null;
      const b = getBounds(el);
      const o = canvasOrigin();
      const tl = worldToScreen({ x: b.x, y: b.y }, s.viewport);
      return { x: tl.x + o.x, y: tl.y + o.y, width: b.width * s.viewport.zoom, height: b.height * s.viewport.zoom };
    },
    flushSave: () => flushSave(),
    whenRendered: () => whenRendered(),
  };
  window.__CHALK__ = hook;
}
