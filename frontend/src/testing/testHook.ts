// window.__CHALK__ test hook installed in every build (WP0).
import type { ChalkElement, ChalkTestHook } from '../types';
import { getState } from '../state/store';
import { screenToWorld, worldToScreen } from '../core/viewport';
import { getBounds } from '../core/geometry';
import { flushSave } from '../persistence/autosave';
import { whenRendered } from '../render/canvas';

export function installTestHook(): void {
  if (typeof window === 'undefined') return;
  const hook: ChalkTestHook = {
    version: 1,
    isReady: () => { const s = getState(); return s.board !== null && s.saveStatus !== 'loading'; },
    getElements: () => structuredClone([...getState().elements]) as ChalkElement[],
    getSelectedIds: () => [...getState().selectedIds],
    getAppState: () => {
      const s = getState();
      return {
        tool: s.tool, toolLocked: s.toolLocked, viewport: { ...s.viewport }, viewportSize: { ...s.viewportSize },
        editingId: s.editing?.id ?? null, boardId: s.board?.id ?? null, boardName: s.board?.name ?? null,
        boardVersion: s.board?.version ?? null, saveStatus: s.saveStatus, canUndo: s.canUndo, canRedo: s.canRedo,
        dialog: s.dialog,
        interaction: {
          marquee: s.interaction.marquee, bindTargetId: s.interaction.bindTarget?.elementId ?? null,
          hoverId: s.interaction.hoverId, dropPreview: s.interaction.dropPreview, gestureActive: s.interaction.gestureActive,
        },
      };
    },
    worldToScreen: (p) => worldToScreen(p, getState().viewport),
    screenToWorld: (p) => screenToWorld(p, getState().viewport),
    getElementScreenBounds: (id) => {
      const s = getState();
      const el = s.elements.find((e) => e.id === id);
      if (!el) return null;
      const b = getBounds(el);
      const tl = worldToScreen({ x: b.x, y: b.y }, s.viewport);
      return { x: tl.x, y: tl.y, width: b.width * s.viewport.zoom, height: b.height * s.viewport.zoom };
    },
    flushSave: () => flushSave(),
    whenRendered: () => whenRendered(),
  };
  window.__CHALK__ = hook;
}
