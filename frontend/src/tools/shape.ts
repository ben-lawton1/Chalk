// Shape tool factory: drag to draw, click to place a default-size shape (WP3).
import type { Point, PointerInfo, ShapeKind, Snapshot, Tool } from '../types';
import { DRAG_THRESHOLD_PX, MIN_SHAPE_SIZE } from '../constants';
import { dist } from '../core/math';
import { SHAPES } from '../core/shapes';
import { addElements, createShape, getElement, replaceElement, shapeRectFromDrag } from '../core/scene';
import { getState, setElements, setInteraction, setSelection } from '../state/store';
import { pushUndo, takeSnapshot } from '../state/history';
import { finishCreation } from '../state/actions';

export function createShapeTool(kind: ShapeKind): Tool {
  let active = false;
  let before: Snapshot | null = null;
  let origin: Point | null = null;
  let downScreen: Point | null = null;
  let id: string | null = null;

  function reset(): void {
    active = false;
    before = null;
    origin = null;
    downScreen = null;
    id = null;
  }

  function step(p: PointerInfo): void {
    if (!active || !origin || !downScreen) return;
    const s = getState();
    const mods = { shift: p.shift, alt: p.alt };
    if (id === null) {
      if (dist(p.screen, downScreen) > DRAG_THRESHOLD_PX) {
        const el = createShape(kind, shapeRectFromDrag(origin, p.world, mods), s.currentStyle);
        setElements(addElements(s.elements, [el]));
        setSelection([el.id]);
        id = el.id;
      }
      return;
    }
    const el = getElement(s.elements, id);
    if (!el || el.type !== 'shape') return;
    const r = shapeRectFromDrag(origin, p.world, mods);
    setElements(replaceElement(s.elements, {
      ...el, x: r.x, y: r.y, width: Math.max(r.width, MIN_SHAPE_SIZE), height: Math.max(r.height, MIN_SHAPE_SIZE),
    }));
  }

  return {
    id: kind,
    cursor: 'crosshair',

    onPointerDown(p) {
      active = true;
      before = takeSnapshot();
      origin = p.world;
      downScreen = p.screen;
      id = null;
    },

    onPointerMove(p) {
      if (!active) {
        setInteraction({ cursor: null });
        return;
      }
      step(p);
    },

    onPointerUp(p) {
      if (!active) return;
      step(p);
      const snap = before;
      if (id === null) {
        const s = getState();
        const size = SHAPES[kind].defaultSize;
        const el = createShape(
          kind,
          { x: p.world.x - size.width / 2, y: p.world.y - size.height / 2, width: size.width, height: size.height },
          s.currentStyle,
        );
        setElements(addElements(s.elements, [el]));
        setSelection([el.id]);
      }
      reset();
      if (snap) pushUndo(snap);
      finishCreation();
    },

    onCancel() {
      if (!active) return;
      if (before) {
        setElements(before.elements);
        setSelection(before.selectedIds);
      }
      reset();
    },
  };
}
