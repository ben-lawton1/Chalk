// Arrow and line tools (one factory): bind to shapes, center-directed anchors, live start sliding (WP3).
import type { ArrowElement, BindableElement, Binding, Point, PointerInfo, Snapshot, Style, Tool } from '../types';
import { ANGLE_SNAP_DEG, LINE_CONFIRM_THRESHOLD_PX } from '../constants';
import { dist, snapAngle } from '../core/math';
import { chooseFixedPoint, findBindTarget, focusPoint } from '../core/binding';
import { addElements, createArrow, setArrowEndpoint } from '../core/scene';
import { getState, setElements, setInteraction, setSelection } from '../state/store';
import { pushUndo, takeSnapshot } from '../state/history';
import { finishCreation } from '../state/actions';

function createLinearTool(toolId: 'arrow' | 'line'): Tool {
  let active = false;
  let before: Snapshot | null = null;
  let startPoint: Point | null = null;
  let startTarget: BindableElement | null = null;
  let startBinding: Binding | null = null;
  let downScreen: Point | null = null;
  let id: string | null = null;

  function reset(): void {
    active = false;
    before = null;
    startPoint = null;
    startTarget = null;
    startBinding = null;
    downScreen = null;
    id = null;
  }

  function currentStyle(): Style {
    const cs = getState().currentStyle;
    return toolId === 'line' ? { ...cs, startArrowhead: 'none', endArrowhead: 'none' } : cs;
  }

  /** Center-directed unless Alt is held at pointerdown (§14.1). */
  function startFixed(t: BindableElement, p: PointerInfo): [number, number] {
    return p.alt ? chooseFixedPoint(t, p.world, true) : [0.5, 0.5];
  }

  function step(p: PointerInfo): void {
    if (!active || !startPoint || !downScreen) return;
    const zoom = getState().viewport.zoom;
    if (id === null) {
      if (dist(p.screen, downScreen) <= LINE_CONFIRM_THRESHOLD_PX) return;
      const el: ArrowElement = { ...createArrow(startPoint, p.world, currentStyle()), startBinding };
      setElements(addElements(getState().elements, [el]));
      setSelection([el.id]);
      id = el.id;
    }
    const arrowId = id;
    const endTarget = p.mod ? null : findBindTarget(getState().elements, p.world, zoom, [arrowId, startBinding?.elementId]);
    const startRef = startTarget && startBinding ? focusPoint(startTarget, startBinding) : startPoint;
    const end = p.shift && !endTarget ? snapAngle(startRef, p.world, ANGLE_SNAP_DEG) : p.world;
    const endBinding: Binding | null = endTarget
      ? { elementId: endTarget.id, fixedPoint: chooseFixedPoint(endTarget, p.world, p.alt) }
      : null;
    setElements(setArrowEndpoint(getState().elements, arrowId, 'end', end, endBinding));
    setInteraction({
      bindTarget: endTarget && endBinding ? { elementId: endTarget.id, focus: focusPoint(endTarget, endBinding) } : null,
    });
  }

  return {
    id: toolId,
    cursor: 'crosshair',

    onPointerDown(p) {
      const s = getState();
      active = true;
      before = takeSnapshot();
      startPoint = p.world;
      downScreen = p.screen;
      id = null;
      startTarget = p.mod ? null : findBindTarget(s.elements, p.world, s.viewport.zoom);
      startBinding = startTarget ? { elementId: startTarget.id, fixedPoint: startFixed(startTarget, p) } : null;
    },

    onPointerMove(p) {
      if (active) {
        step(p);
        return;
      }
      const s = getState();
      const t = p.mod ? null : findBindTarget(s.elements, p.world, s.viewport.zoom);
      setInteraction({
        bindTarget: t
          ? { elementId: t.id, focus: focusPoint(t, { elementId: t.id, fixedPoint: startFixed(t, p) }) }
          : null,
      });
    },

    onPointerUp(p) {
      if (!active) return;
      step(p);
      const snap = before;
      const created = id !== null;
      reset();
      setInteraction({ bindTarget: null });
      if (created && snap) {
        pushUndo(snap);
        finishCreation();
      }
    },

    onCancel() {
      if (!active) return;
      if (before) {
        setElements(before.elements);
        setSelection(before.selectedIds);
      }
      setInteraction({ bindTarget: null });
      reset();
    },
  };
}

export const arrowTool: Tool = createLinearTool('arrow');
export const lineTool: Tool = createLinearTool('line');
