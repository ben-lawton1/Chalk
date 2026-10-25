// Select tool: click/shift/marquee selection, move, 8-handle resize, endpoint drag, Alt-duplicate (WP3).
import type { ArrowElement, ChalkElement, EndpointId, HandleId, PointerInfo, Point, Snapshot, Tool } from '../types';
import { ANGLE_SNAP_DEG, DRAG_THRESHOLD_PX, SELECTION_PADDING_PX } from '../constants';
import { add, dist, expandRect, rectContainsPoint, rectFromPoints, snapAngle, sub } from '../core/math';
import {
  elementsInRect, getHandleMode, getSelectionBox, handlePoint, HANDLE_CURSORS, hitEndpoint, hitHandle, hitTest, isBindable,
} from '../core/geometry';
import { chooseFixedPoint, findBindTarget, focusPoint } from '../core/binding';
import {
  duplicateElements, getElement, moveElements, resizeElements, setArrowEndpoint,
} from '../core/scene';
import { getState, setElements, setInteraction, setSelection } from '../state/store';
import { pushUndo, takeSnapshot } from '../state/history';
import { createTextAt, startEditing } from '../state/actions';

type Gesture =
  | { kind: 'pending'; downScreen: Point; downWorld: Point; before: Snapshot; base: readonly ChalkElement[]; ids: string[]; collapseTo: string | null; toggleOff: string | null }
  | { kind: 'pendingHollow'; downScreen: Point; downWorld: Point; hitId: string; shift: boolean }
  | { kind: 'move'; downWorld: Point; before: Snapshot; base: readonly ChalkElement[]; ids: string[] }
  | { kind: 'resize'; handle: HandleId; grab: Point; before: Snapshot; base: readonly ChalkElement[]; ids: string[] }
  | { kind: 'endpoint'; arrowId: string; which: EndpointId; before: Snapshot; base: readonly ChalkElement[] }
  | { kind: 'marquee'; downScreen: Point; downWorld: Point; additive: boolean; baseSelection: string[]; started: boolean }
  | null;

let gesture: Gesture = null;

/** The selection without the element being edited (its handles are hidden). */
function activeSelection(): string[] {
  const s = getState();
  const editingId = s.editing?.id;
  return editingId ? s.selectedIds.filter((id) => id !== editingId) : [...s.selectedIds];
}

function insidePaddedSelection(elements: readonly ChalkElement[], sel: readonly string[], world: Point, zoom: number): boolean {
  const box = getSelectionBox(elements, sel);
  return box !== null && rectContainsPoint(expandRect(box, SELECTION_PADDING_PX / zoom), world);
}

function hover(p: PointerInfo): void {
  const s = getState();
  const { viewport: v, elements } = s;
  const sel = activeSelection();
  const hit = hitTest(elements, p.world, v.zoom);
  let cursor: string | null = null;
  const mode = getHandleMode(elements, sel);
  if (mode === 'endpoints') {
    const a = getElement(elements, sel[0]!);
    if (a && a.type === 'arrow' && hitEndpoint(a, p.screen, v)) cursor = 'pointer';
  } else if (mode === 'box' || mode === 'text') {
    const box = getSelectionBox(elements, sel);
    const h = box ? hitHandle(box, p.screen, v, mode) : null;
    if (h) cursor = HANDLE_CURSORS[h];
  }
  if (cursor === null) {
    if (hit) {
      if (!hit.hollow || sel.includes(hit.element.id)) cursor = 'move';
    } else if (sel.length >= 1 && !p.shift && insidePaddedSelection(elements, sel, p.world, v.zoom)) {
      cursor = 'move';
    }
  }
  setInteraction({ hoverId: hit?.element.id ?? null, cursor });
}

function applyMove(g: Extract<NonNullable<Gesture>, { kind: 'move' }>, p: PointerInfo): void {
  let d = sub(p.world, g.downWorld);
  if (p.shift) d = Math.abs(d.x) >= Math.abs(d.y) ? { x: d.x, y: 0 } : { x: 0, y: d.y };
  setElements(moveElements(g.base, g.ids, d.x, d.y));
}

function applyResize(g: Extract<NonNullable<Gesture>, { kind: 'resize' }>, p: PointerInfo): void {
  setElements(resizeElements(g.base, g.ids, g.handle, add(p.world, g.grab), { shift: p.shift, alt: p.alt }));
}

function applyEndpoint(g: Extract<NonNullable<Gesture>, { kind: 'endpoint' }>, p: PointerInfo): void {
  const zoom = getState().viewport.zoom;
  const a = getElement(g.base, g.arrowId) as ArrowElement | undefined;
  if (!a || a.type !== 'arrow') return;
  const otherBinding = g.which === 'start' ? a.endBinding : a.startBinding;
  const otherPoint = g.which === 'start' ? a.end : a.start;
  const target = p.mod ? null : findBindTarget(g.base, p.world, zoom, [g.arrowId, otherBinding?.elementId]);
  const otherT = otherBinding ? getElement(g.base, otherBinding.elementId) : undefined;
  const otherRef = otherT && isBindable(otherT) && otherBinding ? focusPoint(otherT, otherBinding) : otherPoint;
  const point = p.shift && !target ? snapAngle(otherRef, p.world, ANGLE_SNAP_DEG) : p.world;
  const binding = target ? { elementId: target.id, fixedPoint: chooseFixedPoint(target, p.world, p.alt) } : null;
  setElements(setArrowEndpoint(g.base, g.arrowId, g.which, point, binding));
  setInteraction({ bindTarget: target && binding ? { elementId: target.id, focus: focusPoint(target, binding) } : null });
}

function applyMarquee(g: Extract<NonNullable<Gesture>, { kind: 'marquee' }>, p: PointerInfo): void {
  if (!g.started) {
    if (dist(p.screen, g.downScreen) <= DRAG_THRESHOLD_PX) return;
    g.started = true;
  }
  const r = rectFromPoints(g.downWorld, p.world);
  const ids = elementsInRect(getState().elements, r);
  setSelection(g.additive ? [...g.baseSelection, ...ids] : ids);
  setInteraction({ marquee: r });
}

function finish(): void {
  setInteraction({ marquee: null, bindTarget: null });
  gesture = null;
}

export const selectTool: Tool = {
  id: 'select',
  cursor: 'default',

  onPointerDown(p) {
    const s = getState();
    const v = s.viewport;
    const zoom = v.zoom;
    const sel = activeSelection();
    const before = takeSnapshot();
    const base = s.elements;
    const downScreen = p.screen;
    const downWorld = p.world;

    const mode = getHandleMode(base, sel);
    if (mode === 'endpoints') {
      const a = getElement(base, sel[0]!);
      const which = a && a.type === 'arrow' ? hitEndpoint(a, p.screen, v) : null;
      if (a && which) {
        gesture = { kind: 'endpoint', arrowId: a.id, which, before, base };
        return;
      }
    } else if (mode === 'box' || mode === 'text') {
      const box = getSelectionBox(base, sel);
      const h = box ? hitHandle(box, p.screen, v, mode) : null;
      if (box && h) {
        gesture = { kind: 'resize', handle: h, grab: sub(handlePoint(box, h), p.world), before, base, ids: [...sel] };
        return;
      }
    }

    const hit = hitTest(base, p.world, zoom);
    if (hit && (!hit.hollow || sel.includes(hit.element.id))) {
      const id = hit.element.id;
      const isSel = sel.includes(id);
      if (p.shift && isSel) {
        gesture = { kind: 'pending', downScreen, downWorld, before, base, ids: [...sel], collapseTo: null, toggleOff: id };
      } else if (p.shift) {
        const next = [...sel, id];
        setSelection(next);
        gesture = { kind: 'pending', downScreen, downWorld, before, base, ids: next, collapseTo: null, toggleOff: null };
      } else if (!isSel) {
        setSelection([id]);
        gesture = { kind: 'pending', downScreen, downWorld, before, base, ids: [id], collapseTo: null, toggleOff: null };
      } else {
        gesture = { kind: 'pending', downScreen, downWorld, before, base, ids: [...sel], collapseTo: sel.length > 1 ? id : null, toggleOff: null };
      }
      return;
    }
    if (hit) {
      gesture = { kind: 'pendingHollow', downScreen, downWorld, hitId: hit.element.id, shift: p.shift };
      return;
    }
    if (sel.length >= 1 && !p.shift && insidePaddedSelection(base, sel, p.world, zoom)) {
      gesture = { kind: 'pending', downScreen, downWorld, before, base, ids: [...sel], collapseTo: null, toggleOff: null };
      return;
    }
    if (!p.shift) setSelection([]);
    gesture = { kind: 'marquee', downScreen, downWorld, additive: p.shift, baseSelection: p.shift ? [...sel] : [], started: false };
  },

  onPointerMove(p) {
    const g = gesture;
    if (!g) {
      hover(p);
      return;
    }
    switch (g.kind) {
      case 'pending': {
        if (dist(p.screen, g.downScreen) <= DRAG_THRESHOLD_PX) return;
        let base = g.base;
        let ids = g.ids;
        if (p.alt) {
          const dup = duplicateElements(base, ids, { x: 0, y: 0 });
          base = dup.elements;
          ids = dup.newIds;
          setSelection(dup.newIds);
        }
        const mv: Extract<NonNullable<Gesture>, { kind: 'move' }> = { kind: 'move', downWorld: g.downWorld, before: g.before, base, ids };
        gesture = mv;
        applyMove(mv, p);
        return;
      }
      case 'pendingHollow': {
        if (dist(p.screen, g.downScreen) <= DRAG_THRESHOLD_PX) return;
        if (!g.shift) setSelection([]);
        const mq: Extract<NonNullable<Gesture>, { kind: 'marquee' }> = {
          kind: 'marquee', downScreen: g.downScreen, downWorld: g.downWorld, additive: g.shift,
          baseSelection: g.shift ? [...getState().selectedIds] : [], started: true,
        };
        gesture = mq;
        applyMarquee(mq, p);
        return;
      }
      case 'move':
        applyMove(g, p);
        return;
      case 'resize':
        applyResize(g, p);
        return;
      case 'endpoint':
        applyEndpoint(g, p);
        return;
      case 'marquee':
        applyMarquee(g, p);
        return;
    }
  },

  onPointerUp(p) {
    const g = gesture;
    if (!g) return;
    switch (g.kind) {
      case 'pending': {
        const cur = getState().selectedIds;
        if (g.toggleOff) setSelection(cur.filter((id) => id !== g.toggleOff));
        else if (g.collapseTo) setSelection([g.collapseTo]);
        break;
      }
      case 'pendingHollow':
        setSelection(g.shift ? [...getState().selectedIds, g.hitId] : [g.hitId]);
        break;
      case 'move':
        applyMove(g, p);
        pushUndo(g.before);
        break;
      case 'resize':
        applyResize(g, p);
        pushUndo(g.before);
        break;
      case 'endpoint':
        applyEndpoint(g, p);
        pushUndo(g.before);
        break;
      case 'marquee':
        applyMarquee(g, p);
        break;
    }
    finish();
  },

  onDoubleClick(p) {
    const s = getState();
    const hit = hitTest(s.elements, p.world, s.viewport.zoom);
    if (hit) startEditing(hit.element.id);
    else createTextAt(p.world);
  },

  onCancel() {
    const g = gesture;
    if (!g) return;
    if (g.kind === 'move' || g.kind === 'resize' || g.kind === 'endpoint') {
      setElements(g.before.elements);
      setSelection(g.before.selectedIds);
    } else if (g.kind === 'marquee') {
      setSelection(g.baseSelection);
    }
    finish();
  },
};
