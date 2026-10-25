// Unit tests for the tools: synthetic PointerInfo against a reset store with an identity viewport (WP3).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArrowElement, ChalkElement, PointerInfo, ShapeElement, TextElement, Tool } from '../types';
import { BIND_GAP, DEFAULT_STYLE } from '../constants';
import { getState, resetState, setElements, setSelection, setState } from '../state/store';
import { clearHistory, getHistorySizes } from '../state/history';
import { undo } from '../state/actions';
import { TOOLS } from './index';

interface Mods { shift?: boolean; alt?: boolean; mod?: boolean }
function pi(x: number, y: number, m: Mods = {}): PointerInfo {
  return { world: { x, y }, screen: { x, y }, shift: !!m.shift, alt: !!m.alt, mod: !!m.mod, button: 0, buttons: 1 };
}
/** down at pts[0], moves through the middle points, up at the last point. */
function drag(tool: Tool, pts: [number, number][], downMods: Mods = {}, upMods: Mods = downMods): void {
  const first = pts[0]!;
  tool.onPointerDown(pi(first[0], first[1], downMods));
  for (let i = 1; i < pts.length - 1; i++) tool.onPointerMove(pi(pts[i]![0], pts[i]![1], downMods));
  const last = pts[pts.length - 1]!;
  tool.onPointerUp(pi(last[0], last[1], upMods));
}
function click(tool: Tool, x: number, y: number, m: Mods = {}): void {
  tool.onPointerDown(pi(x, y, m));
  tool.onPointerUp(pi(x, y, m));
}

function rect(id: string, x: number, y: number, w: number, h: number, filled = true): ShapeElement {
  return {
    id, seed: 11, style: { ...DEFAULT_STYLE, backgroundColor: filled ? '#a5d8ff' : 'transparent' }, type: 'shape',
    shape: 'rectangle', x, y, width: w, height: h, label: '',
  };
}
function els(): readonly ChalkElement[] {
  return getState().elements;
}
function shapes(): ShapeElement[] {
  return els().filter((e): e is ShapeElement => e.type === 'shape');
}
function arrows(): ArrowElement[] {
  return els().filter((e): e is ArrowElement => e.type === 'arrow');
}
function seed(...list: ChalkElement[]): void {
  setElements(list);
  clearHistory();
}

beforeEach(() => {
  resetState();
  clearHistory();
});

describe('shape tool', () => {
  it('drag-creates a rectangle with exact bounds, selects it, one undo step, returns to select', () => {
    drag(TOOLS.rectangle, [[100, 100], [200, 150], [300, 250]]);
    expect(shapes()).toHaveLength(1);
    const r = shapes()[0]!;
    expect([r.x, r.y, r.width, r.height]).toEqual([100, 100, 200, 150]);
    expect(getState().selectedIds).toEqual([r.id]);
    expect(getState().tool).toBe('select');
    expect(getHistorySizes().past).toBe(1);
    undo();
    expect(els()).toHaveLength(0);
  });
  it('drag up-left normalizes the rect', () => {
    drag(TOOLS.ellipse, [[300, 300], [100, 120]]);
    const r = shapes()[0]!;
    expect(r.shape).toBe('ellipse');
    expect([r.x, r.y, r.width, r.height]).toEqual([100, 120, 200, 180]);
  });
  it('click places a default-size shape centered on the click', () => {
    click(TOOLS.rectangle, 200, 200);
    const r = shapes()[0]!;
    expect([r.x, r.y, r.width, r.height]).toEqual([120, 150, 160, 100]);
    expect(getState().selectedIds).toEqual([r.id]);
    expect(getHistorySizes().past).toBe(1);
  });
  it('Shift makes a square', () => {
    drag(TOOLS.rectangle, [[100, 100], [250, 150], [300, 150]], { shift: true });
    const r = shapes()[0]!;
    expect([r.width, r.height]).toEqual([200, 200]);
  });
  it('Shift pressed only at the pointerup still gives a square (release step)', () => {
    drag(TOOLS.rectangle, [[100, 100], [250, 150], [300, 150]], {}, { shift: true });
    const r = shapes()[0]!;
    expect([r.x, r.y, r.width, r.height]).toEqual([100, 100, 200, 200]);
  });
  it('a release past the threshold with no prior move still creates the shape', () => {
    drag(TOOLS.rectangle, [[100, 100], [220, 180]]);
    const r = shapes()[0]!;
    expect([r.width, r.height]).toEqual([120, 80]);
  });
  it('Alt draws from the center', () => {
    drag(TOOLS.rectangle, [[200, 200], [250, 230]], { alt: true });
    const r = shapes()[0]!;
    expect([r.x, r.y, r.width, r.height]).toEqual([150, 170, 100, 60]);
  });
  it('keeps the tool when locked', () => {
    setState({ tool: 'rectangle', toolLocked: true });
    click(TOOLS.rectangle, 100, 100);
    expect(getState().tool).toBe('rectangle');
  });
  it('cancel restores and a later hover move changes nothing', () => {
    const t = TOOLS.rectangle;
    t.onPointerDown(pi(100, 100));
    t.onPointerMove(pi(200, 200));
    expect(shapes()).toHaveLength(1);
    t.onCancel!();
    expect(els()).toHaveLength(0);
    t.onPointerMove(pi(400, 400));
    t.onPointerUp(pi(400, 400));
    expect(els()).toHaveLength(0);
    expect(getHistorySizes().past).toBe(0);
  });
});

describe('select tool: selection', () => {
  it('clicking a filled shape selects it; clicking empty space clears', () => {
    seed(rect('a', 0, 0, 100, 100), rect('b', 300, 0, 100, 100));
    click(TOOLS.select, 50, 50);
    expect(getState().selectedIds).toEqual(['a']);
    click(TOOLS.select, 350, 50);
    expect(getState().selectedIds).toEqual(['b']);
    click(TOOLS.select, 600, 600);
    expect(getState().selectedIds).toEqual([]);
    expect(getHistorySizes().past).toBe(0);
  });
  it('Shift+click toggles membership', () => {
    seed(rect('a', 0, 0, 100, 100), rect('b', 300, 0, 100, 100));
    click(TOOLS.select, 50, 50);
    click(TOOLS.select, 350, 50, { shift: true });
    expect(getState().selectedIds).toEqual(['a', 'b']);
    click(TOOLS.select, 50, 50, { shift: true });
    expect(getState().selectedIds).toEqual(['b']);
  });
  it('clicking a member of a multi-selection collapses to it on release', () => {
    seed(rect('a', 0, 0, 100, 100), rect('b', 300, 0, 100, 100));
    setSelection(['a', 'b']);
    click(TOOLS.select, 50, 50);
    expect(getState().selectedIds).toEqual(['a']);
  });
  it('a click inside a hollow shape selects it', () => {
    seed(rect('frame', 0, 0, 400, 400, false));
    click(TOOLS.select, 200, 200);
    expect(getState().selectedIds).toEqual(['frame']);
  });
  it('a drag inside an unselected hollow shape starts a marquee instead of moving it', () => {
    seed(rect('frame', 0, 0, 400, 400, false), rect('inner', 100, 100, 50, 50));
    drag(TOOLS.select, [[20, 20], [100, 100], [200, 200]]);
    expect(getState().selectedIds).toEqual(['inner']);
    expect((els()[0] as ShapeElement).x).toBe(0);
    expect(getState().interaction.marquee).toBeNull();
    expect(getHistorySizes().past).toBe(0);
  });
  it('a drag inside an already selected hollow shape moves it', () => {
    seed(rect('frame', 0, 0, 400, 400, false));
    setSelection(['frame']);
    drag(TOOLS.select, [[200, 200], [230, 210], [250, 220]]);
    const f = els()[0] as ShapeElement;
    expect([f.x, f.y]).toEqual([50, 20]);
    expect(getHistorySizes().past).toBe(1);
  });
  it('marquee selects the elements fully inside (2 of 3) and clears the marquee on release', () => {
    seed(rect('a', 0, 0, 50, 50), rect('b', 100, 0, 50, 50), rect('c', 300, 300, 50, 50));
    TOOLS.select.onPointerDown(pi(-10, -10));
    TOOLS.select.onPointerMove(pi(100, 80));
    expect(getState().interaction.marquee).not.toBeNull();
    TOOLS.select.onPointerUp(pi(200, 100));
    expect(getState().selectedIds).toEqual(['a', 'b']);
    expect(getState().interaction.marquee).toBeNull();
  });
  it('Shift marquee adds to the existing selection', () => {
    seed(rect('a', 0, 0, 50, 50), rect('c', 300, 300, 50, 50));
    setSelection(['c']);
    drag(TOOLS.select, [[-10, -10], [100, 100]], { shift: true });
    expect(getState().selectedIds).toEqual(['c', 'a']);
  });
  it('hover sets hoverId and a move cursor over a strong hit', () => {
    seed(rect('a', 0, 0, 100, 100));
    TOOLS.select.onPointerMove(pi(50, 50));
    expect(getState().interaction.hoverId).toBe('a');
    expect(getState().interaction.cursor).toBe('move');
    TOOLS.select.onPointerMove(pi(500, 500));
    expect(getState().interaction.hoverId).toBeNull();
    expect(getState().interaction.cursor).toBeNull();
  });
  it('a double click on empty canvas creates text and on a shape edits its label', () => {
    seed(rect('a', 0, 0, 100, 100));
    TOOLS.select.onDoubleClick!(pi(50, 50));
    expect(getState().editing?.id).toBe('a');
    resetState({ elements: getState().elements });
    TOOLS.select.onDoubleClick!(pi(500, 500));
    const t = els().find((e) => e.type === 'text');
    expect(t).toBeDefined();
    expect(getState().editing?.id).toBe(t!.id);
  });
});

describe('select tool: move, resize, duplicate', () => {
  it('moves a selected element by the drag delta, one undo step', () => {
    seed(rect('a', 0, 0, 100, 100));
    drag(TOOLS.select, [[50, 50], [80, 60], [90, 70]]);
    const a = els()[0] as ShapeElement;
    expect([a.x, a.y]).toEqual([40, 20]);
    expect(getHistorySizes().past).toBe(1);
    undo();
    expect((els()[0] as ShapeElement).x).toBe(0);
  });
  it('Shift locks the dominant axis', () => {
    seed(rect('a', 0, 0, 100, 100));
    drag(TOOLS.select, [[50, 50], [100, 60], [150, 70]], { shift: true });
    const a = els()[0] as ShapeElement;
    expect([a.x, a.y]).toEqual([100, 0]);
  });
  it('a sub-threshold wiggle moves nothing and records nothing', () => {
    seed(rect('a', 0, 0, 100, 100));
    drag(TOOLS.select, [[50, 50], [51, 51], [52, 51]]);
    expect((els()[0] as ShapeElement).x).toBe(0);
    expect(getHistorySizes().past).toBe(0);
  });
  it('resizes from the se handle and flips past the anchor', () => {
    seed(rect('a', 100, 100, 100, 100));
    setSelection(['a']);
    drag(TOOLS.select, [[204, 204], [230, 230], [254, 254]]); // padded se handle; grab offset keeps it jump-free
    let a = els()[0] as ShapeElement;
    expect([a.x, a.y, a.width, a.height]).toEqual([100, 100, 150, 150]);
    expect(getHistorySizes().past).toBe(1);
    undo();
    setSelection(['a']);
    drag(TOOLS.select, [[204, 204], [150, 150], [54, 54]]); // pointer ends at (50,50): left/up of the nw anchor
    a = els()[0] as ShapeElement;
    expect([a.x, a.y, a.width, a.height]).toEqual([50, 50, 50, 50]);
  });
  it('Alt-drag duplicates and moves the copies, leaving the original', () => {
    seed(rect('a', 0, 0, 100, 100));
    setSelection(['a']);
    drag(TOOLS.select, [[50, 50], [90, 90], [150, 50]], { alt: true });
    expect(shapes()).toHaveLength(2);
    expect((els()[0] as ShapeElement).x).toBe(0);
    const copy = els()[1] as ShapeElement;
    expect(copy.x).toBe(100);
    expect(getState().selectedIds).toEqual([copy.id]);
    expect(getHistorySizes().past).toBe(1);
  });
  it('cancel mid-move restores elements and selection', () => {
    seed(rect('a', 0, 0, 100, 100));
    setSelection(['a']);
    TOOLS.select.onPointerDown(pi(50, 50));
    TOOLS.select.onPointerMove(pi(150, 150));
    expect((els()[0] as ShapeElement).x).toBe(100);
    TOOLS.select.onCancel!();
    expect((els()[0] as ShapeElement).x).toBe(0);
    expect(getState().selectedIds).toEqual(['a']);
    TOOLS.select.onPointerMove(pi(300, 300)); // hover only
    expect((els()[0] as ShapeElement).x).toBe(0);
    expect(getHistorySizes().past).toBe(0);
  });
});

describe('arrow tool', () => {
  const A = () => rect('A', 300, 300, 160, 100);
  const B = () => rect('B', 800, 300, 160, 100);

  it('binds both ends center-directed and places the endpoints on the outlines plus the gap', () => {
    seed(A(), B());
    drag(TOOLS.arrow, [[380, 350], [600, 350], [880, 350]]);
    const ar = arrows()[0]!;
    expect(ar.startBinding).toEqual({ elementId: 'A', fixedPoint: [0.5, 0.5] });
    expect(ar.endBinding).toEqual({ elementId: 'B', fixedPoint: [0.5, 0.5] });
    const gap = BIND_GAP + DEFAULT_STYLE.strokeWidth / 2;
    expect(ar.start.x).toBeCloseTo(460 + gap, 0);
    expect(ar.end.x).toBeCloseTo(800 - gap, 0);
    expect(ar.start.y).toBeCloseTo(350, 0);
    expect(getState().tool).toBe('select');
    expect(getState().selectedIds).toEqual([ar.id]);
    expect(getHistorySizes().past).toBe(1);
    expect(getState().interaction.bindTarget).toBeNull();
  });
  it('an off-center start is center-directed; with Alt at pointerdown it anchors at the point', () => {
    seed(A(), B());
    drag(TOOLS.arrow, [[330, 330], [600, 340], [880, 350]]);
    expect(arrows()[0]!.startBinding?.fixedPoint).toEqual([0.5, 0.5]);
    resetState();
    clearHistory();
    seed(A(), B());
    drag(TOOLS.arrow, [[330, 330], [600, 340], [880, 350]], { alt: true }, { alt: false });
    const fp = arrows()[0]!.startBinding!.fixedPoint;
    expect(fp[0]).toBeCloseTo(0.1875);
    expect(fp[1]).toBeCloseTo(0.3);
  });
  it('shows the bind target on hover and clears it away from shapes', () => {
    seed(A());
    TOOLS.arrow.onPointerMove(pi(380, 350));
    expect(getState().interaction.bindTarget?.elementId).toBe('A');
    TOOLS.arrow.onPointerMove(pi(100, 100));
    expect(getState().interaction.bindTarget).toBeNull();
  });
  it('Ctrl suppresses binding', () => {
    seed(A(), B());
    drag(TOOLS.arrow, [[380, 350], [600, 350], [880, 350]], { mod: true });
    const ar = arrows()[0]!;
    expect(ar.startBinding).toBeNull();
    expect(ar.endBinding).toBeNull();
    expect(ar.end).toEqual({ x: 880, y: 350 });
  });
  it('a drag shorter than the confirm threshold creates nothing', () => {
    seed(A());
    drag(TOOLS.arrow, [[380, 350], [384, 350], [386, 351]]);
    expect(arrows()).toHaveLength(0);
    expect(getHistorySizes().past).toBe(0);
  });
  it('Shift snaps a free end to 15 degrees', () => {
    drag(TOOLS.arrow, [[100, 100], [300, 140], [300, 130]], { shift: true });
    const ar = arrows()[0]!;
    const deg = (Math.atan2(ar.end.y - ar.start.y, ar.end.x - ar.start.x) * 180) / Math.PI;
    expect(deg).toBeCloseTo(15, 3);
  });
  it('dragging the end back over the start shape stays unbound', () => {
    seed(A(), B());
    drag(TOOLS.arrow, [[380, 350], [600, 350], [420, 330]]);
    const ar = arrows()[0]!;
    expect(ar.endBinding).toBeNull();
    expect(ar.end).toEqual({ x: 420, y: 330 });
  });
  it('the line tool makes an arrow with no heads and leaves currentStyle alone', () => {
    drag(TOOLS.line, [[0, 0], [100, 0], [200, 0]]);
    const ar = arrows()[0]!;
    expect(ar.style.startArrowhead).toBe('none');
    expect(ar.style.endArrowhead).toBe('none');
    expect(getState().currentStyle.endArrowhead).toBe('arrow');
  });
  it('cancel restores, clears the highlight, and a later hover creates nothing', () => {
    seed(A(), B());
    const t = TOOLS.arrow;
    t.onPointerDown(pi(380, 350));
    t.onPointerMove(pi(600, 350));
    expect(arrows()).toHaveLength(1);
    t.onCancel!();
    expect(arrows()).toHaveLength(0);
    expect(getState().interaction.bindTarget).toBeNull();
    t.onPointerMove(pi(880, 350)); // hover
    t.onPointerUp(pi(880, 350));
    expect(arrows()).toHaveLength(0);
    expect(getHistorySizes().past).toBe(0);
  });
});

describe('select tool: arrow endpoints', () => {
  it('drags an endpoint onto another shape and rebinds it, one undo step', () => {
    const A = rect('A', 300, 300, 160, 100);
    const B = rect('B', 800, 300, 160, 100);
    const C = rect('C', 800, 600, 160, 100);
    seed(A, B, C);
    drag(TOOLS.arrow, [[380, 350], [600, 350], [880, 350]]);
    clearHistory();
    const ar = arrows()[0]!;
    setSelection([ar.id]);
    // grab the end endpoint (screen == world here) and move it onto C
    drag(TOOLS.select, [[ar.end.x, ar.end.y], [850, 500], [880, 650]]);
    const moved = arrows()[0]!;
    expect(moved.endBinding?.elementId).toBe('C');
    expect(moved.startBinding?.elementId).toBe('A');
    expect(getHistorySizes().past).toBe(1);
    undo();
    expect(arrows()[0]!.endBinding?.elementId).toBe('B');
  });
  it('Ctrl while dragging an endpoint unbinds it', () => {
    const A = rect('A', 300, 300, 160, 100);
    const B = rect('B', 800, 300, 160, 100);
    seed(A, B);
    drag(TOOLS.arrow, [[380, 350], [600, 350], [880, 350]]);
    const ar = arrows()[0]!;
    setSelection([ar.id]);
    drag(TOOLS.select, [[ar.end.x, ar.end.y], [850, 340], [880, 330]], { mod: true });
    expect(arrows()[0]!.endBinding).toBeNull();
    expect(arrows()[0]!.end).toEqual({ x: 880, y: 330 });
  });
});

describe('hand tool', () => {
  it('pans by the screen delta divided by zoom and cancel restores the viewport', () => {
    setState({ viewport: { scrollX: 10, scrollY: 20, zoom: 2 } });
    TOOLS.hand.onPointerDown(pi(100, 100));
    TOOLS.hand.onPointerMove(pi(140, 120));
    expect(getState().viewport).toEqual({ scrollX: 30, scrollY: 30, zoom: 2 });
    TOOLS.hand.onCancel!();
    expect(getState().viewport).toEqual({ scrollX: 10, scrollY: 20, zoom: 2 });
    TOOLS.hand.onPointerMove(pi(300, 300)); // hover: nothing
    expect(getState().viewport).toEqual({ scrollX: 10, scrollY: 20, zoom: 2 });
  });
  it('the release position counts', () => {
    TOOLS.hand.onPointerDown(pi(0, 0));
    TOOLS.hand.onPointerUp(pi(25, -10));
    expect(getState().viewport.scrollX).toBe(25);
    expect(getState().viewport.scrollY).toBe(-10);
    expect(getHistorySizes().past).toBe(0);
  });
});

describe('text tool', () => {
  it('clicking empty canvas creates a text element and starts editing it', () => {
    setState({ tool: 'text' });
    click(TOOLS.text, 100, 100);
    const t = els().find((e): e is TextElement => e.type === 'text');
    expect(t).toBeDefined();
    expect(t!.text).toBe('');
    expect(getState().editing?.id).toBe(t!.id);
  });
  it('clicking an existing shape edits its label', () => {
    seed(rect('a', 0, 0, 100, 100));
    setState({ tool: 'text' });
    click(TOOLS.text, 50, 50);
    expect(getState().editing?.id).toBe('a');
    expect(els()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Pointer router (input/pointer.ts) against a fake canvas in node
// ---------------------------------------------------------------------------
describe('pointer router', () => {
  class FakeCanvas extends EventTarget {
    style = { cursor: '' };
    captured = new Set<number>();
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 800, height: 600 };
    }
    setPointerCapture(id: number) { this.captured.add(id); }
    hasPointerCapture(id: number) { return this.captured.has(id); }
    releasePointerCapture(id: number) { this.captured.delete(id); }
  }
  const win = new EventTarget();
  let canvas: FakeCanvas;
  let detach: () => void;
  let pointer: typeof import('../input/pointer');

  function fire(target: EventTarget, type: string, props: Record<string, unknown> = {}): Event {
    const e = Object.assign(new Event(type, { cancelable: true }), props);
    target.dispatchEvent(e);
    return e;
  }
  function ptr(type: string, x: number, y: number, o: Record<string, unknown> = {}): Event {
    return fire(canvas, type, {
      clientX: x, clientY: y, pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1,
      shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...o,
    });
  }

  beforeEach(async () => {
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', { activeElement: null });
    vi.stubGlobal('HTMLElement', class {});
    pointer = await import('../input/pointer');
    canvas = new FakeCanvas();
    detach = pointer.attachPointerInput(canvas as unknown as HTMLCanvasElement);
  });
  afterEach(() => {
    detach();
    vi.unstubAllGlobals();
  });

  it('routes a drag to the active tool, toggling gestureActive and pointer capture', () => {
    setState({ tool: 'rectangle' });
    ptr('pointerdown', 100, 100);
    expect(getState().interaction.gestureActive).toBe(true);
    expect(canvas.captured.has(1)).toBe(true);
    ptr('pointermove', 200, 180);
    ptr('pointerup', 300, 200);
    expect(getState().interaction.gestureActive).toBe(false);
    expect(canvas.captured.size).toBe(0);
    expect(shapes()).toHaveLength(1);
    expect([shapes()[0]!.width, shapes()[0]!.height]).toEqual([200, 100]);
  });
  it('the lostpointercapture of a normal release does not cancel', () => {
    setState({ tool: 'rectangle' });
    ptr('pointerdown', 100, 100);
    ptr('pointerup', 300, 200);
    ptr('lostpointercapture', 0, 0);
    expect(shapes()).toHaveLength(1);
    expect(getHistorySizes().past).toBe(1);
  });
  it('a lost pointerup is recovered by a move with no buttons down', () => {
    setState({ tool: 'rectangle' });
    ptr('pointerdown', 100, 100);
    ptr('pointermove', 150, 150, { buttons: 1 });
    ptr('pointermove', 300, 200, { buttons: 0 });
    expect(getState().interaction.gestureActive).toBe(false);
    expect([shapes()[0]!.width, shapes()[0]!.height]).toEqual([200, 100]);
  });
  it('a new pointerdown of the same pointer finishes the stale gesture first', () => {
    setState({ tool: 'rectangle' });
    ptr('pointerdown', 100, 100);
    ptr('pointermove', 200, 200);
    ptr('pointerdown', 400, 400);
    expect(shapes()).toHaveLength(1);
    expect(getState().interaction.gestureActive).toBe(true);
  });
  it('ignores other pointers during a gesture', () => {
    setState({ tool: 'rectangle' });
    ptr('pointerdown', 100, 100);
    ptr('pointerdown', 500, 500, { pointerId: 2 });
    ptr('pointermove', 600, 600, { pointerId: 2 });
    ptr('pointerup', 600, 600, { pointerId: 2 });
    expect(getState().interaction.gestureActive).toBe(true);
    expect(shapes()).toHaveLength(0);
  });
  it('cancelGesture restores the pre-gesture scene and ends the gesture', () => {
    setState({ tool: 'rectangle' });
    ptr('pointerdown', 100, 100);
    ptr('pointermove', 200, 200);
    expect(shapes()).toHaveLength(1);
    pointer.cancelGesture();
    expect(shapes()).toHaveLength(0);
    expect(getState().interaction.gestureActive).toBe(false);
    expect(canvas.captured.size).toBe(0);
    ptr('pointerup', 300, 300); // late event: nothing happens
    expect(shapes()).toHaveLength(0);
  });
  it('pointercancel, lostpointercapture mid-gesture and window blur all cancel', () => {
    setState({ tool: 'rectangle' });
    for (const how of ['pointercancel', 'lostpointercapture', 'blur'] as const) {
      ptr('pointerdown', 100, 100);
      ptr('pointermove', 200, 200);
      if (how === 'blur') fire(win, 'blur');
      else ptr(how, 200, 200);
      expect(shapes()).toHaveLength(0);
      expect(getState().interaction.gestureActive).toBe(false);
    }
  });
  it('a pointerdown while editing commits the edit and starts no gesture', () => {
    setState({ tool: 'text' });
    ptr('pointerdown', 100, 100); // creates a text and starts editing
    ptr('pointerup', 100, 100);
    expect(getState().editing).not.toBeNull();
    ptr('pointerdown', 400, 400);
    expect(getState().editing).toBeNull();
    expect(getState().interaction.gestureActive).toBe(false);
    expect(els()).toHaveLength(0); // empty text removed
  });
  it('the hand tool, the middle button and Space+drag all pan', () => {
    setState({ tool: 'hand' });
    ptr('pointerdown', 0, 0);
    ptr('pointermove', 30, 10);
    expect(canvas.style.cursor).toBe('grabbing');
    ptr('pointerup', 30, 10);
    expect(getState().viewport.scrollX).toBe(30);
    setState({ tool: 'rectangle' });
    ptr('pointerdown', 0, 0, { button: 1 });
    ptr('pointermove', 10, 0, { buttons: 4 });
    ptr('pointerup', 10, 0, { button: 1 });
    expect(getState().viewport.scrollX).toBe(40);
    fire(win, 'keydown', { code: 'Space', repeat: false });
    expect(pointer.isSpaceHeld()).toBe(true);
    expect(canvas.style.cursor).toBe('grab');
    ptr('pointerdown', 0, 0);
    ptr('pointermove', 5, 0);
    ptr('pointerup', 5, 0);
    expect(getState().viewport.scrollX).toBe(45);
    expect(shapes()).toHaveLength(0);
    fire(win, 'keyup', { code: 'Space' });
    expect(pointer.isSpaceHeld()).toBe(false);
  });
  it('the right button starts nothing', () => {
    setState({ tool: 'rectangle' });
    ptr('pointerdown', 100, 100, { button: 2 });
    expect(getState().interaction.gestureActive).toBe(false);
  });
  it('pointermove tracks the last pointer world position and pointerleave clears hover', async () => {
    const store = await import('../state/store');
    ptr('pointermove', 12, 34);
    expect(store.getLastPointerWorld()).toEqual({ x: 12, y: 34 });
    setState({ interaction: { ...getState().interaction, hoverId: 'x', cursor: 'move' } });
    fire(canvas, 'pointerleave');
    expect(getState().interaction.hoverId).toBeNull();
    expect(getState().interaction.cursor).toBeNull();
  });
  it('handleWheel pans, shift-pans horizontally and zooms about the cursor with ctrl', () => {
    const w = (o: Record<string, unknown>) => ({ preventDefault() {}, deltaX: 0, deltaY: 0, deltaMode: 0, clientX: 0, clientY: 0, ctrlKey: false, metaKey: false, shiftKey: false, ...o }) as unknown as WheelEvent;
    pointer.handleWheel(w({ deltaY: 40 }));
    expect(getState().viewport.scrollY).toBe(-40);
    pointer.handleWheel(w({ deltaY: 25, shiftKey: true }));
    expect(getState().viewport.scrollX).toBe(-25);
    setState({ viewport: { scrollX: 0, scrollY: 0, zoom: 1 } });
    pointer.handleWheel(w({ deltaY: -10, ctrlKey: true, clientX: 200, clientY: 100 }));
    const v = getState().viewport;
    expect(v.zoom).toBeCloseTo(Math.exp(0.1));
    expect(200 / v.zoom - v.scrollX).toBeCloseTo(200); // world point under the cursor is fixed
  });
  it('detach is idempotent and removes the listeners', () => {
    detach();
    detach();
    setState({ tool: 'rectangle' });
    ptr('pointerdown', 100, 100);
    expect(getState().interaction.gestureActive).toBe(false);
  });
});
