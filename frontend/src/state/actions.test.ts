// Unit tests for state/actions (WP3).
import { beforeEach, describe, expect, it } from 'vitest';
import type { ArrowElement, ChalkElement, ShapeElement, TextElement } from '../types';
import { DEFAULT_STYLE, DUPLICATE_OFFSET } from '../constants';
import { getBounds } from '../core/geometry';
import { toSceneFile } from '../core/serialize';
import { getState, resetState, setElements, setInteraction, setLastPointerWorld, setSelection, setState } from './store';
import { clearHistory, getHistorySizes } from './history';
import {
  applyStyle, closeDialog, commitEditing, copySelection, createTextAt, cutSelection, deleteSelection, duplicateSelection,
  editSelection, finishCreation, nudgeSelection, openDialog, pasteClipboard, pasteText, placeShape, redo, reorderSelection,
  selectAll, setTool, startEditing, toggleToolLock, undo, updateEditingText, zoomIn, zoomOut, zoomToFit, zoomToSelection, resetZoom,
} from './actions';

function rect(id: string, x: number, y: number, w = 100, h = 60): ShapeElement {
  return { id, seed: 7, style: { ...DEFAULT_STYLE }, type: 'shape', shape: 'rectangle', x, y, width: w, height: h, label: '' };
}
function arrow(id: string, from: string, to: string): ArrowElement {
  return {
    id, seed: 9, style: { ...DEFAULT_STYLE }, type: 'arrow', start: { x: 100, y: 30 }, end: { x: 300, y: 30 },
    startBinding: { elementId: from, fixedPoint: [0.5, 0.5] }, endBinding: { elementId: to, fixedPoint: [0.5, 0.5] }, label: '',
  };
}
function text(id: string, t: string): TextElement {
  return { id, seed: 3, style: { ...DEFAULT_STYLE }, type: 'text', x: 10, y: 10, width: 50, height: 30, text: t, autoResize: true };
}
function ids(): string[] {
  return getState().elements.map((e) => e.id);
}

beforeEach(() => {
  resetState();
  clearHistory();
});

// Kept first: the in-app buffer is module state and starts empty only in a fresh module.
describe('clipboard buffer', () => {
  it('pasteClipboard is false while the buffer is empty', () => {
    expect(pasteClipboard()).toBe(false);
  });
  it('copySelection returns null when nothing is selected', () => {
    setElements([rect('a', 0, 0)]);
    expect(copySelection()).toBeNull();
    expect(pasteClipboard()).toBe(false);
  });
});

describe('tools', () => {
  it('setTool to a drawing tool clears selection and transient interaction', () => {
    setElements([rect('a', 0, 0)]);
    setSelection(['a']);
    setInteraction({ hoverId: 'a', cursor: 'move' });
    setTool('rectangle');
    const s = getState();
    expect(s.tool).toBe('rectangle');
    expect(s.selectedIds).toEqual([]);
    expect(s.interaction.hoverId).toBeNull();
    expect(s.interaction.cursor).toBeNull();
  });
  it('setTool to select or hand keeps the selection', () => {
    setElements([rect('a', 0, 0)]);
    setSelection(['a']);
    setTool('hand');
    expect(getState().selectedIds).toEqual(['a']);
    setTool('select');
    expect(getState().selectedIds).toEqual(['a']);
  });
  it('finishCreation returns to select unless locked', () => {
    setTool('arrow');
    finishCreation();
    expect(getState().tool).toBe('select');
    setTool('arrow');
    toggleToolLock();
    finishCreation();
    expect(getState().tool).toBe('arrow');
  });
  it('selectAll switches to select and selects every element', () => {
    setElements([rect('a', 0, 0), rect('b', 200, 0)]);
    setTool('hand');
    selectAll();
    expect(getState().tool).toBe('select');
    expect(getState().selectedIds).toEqual(['a', 'b']);
  });
});

describe('delete', () => {
  it('delete + undo restores the arrow and its bindings', () => {
    const a = rect('a', 0, 0);
    const b = rect('b', 300, 0);
    const ar = arrow('ar', 'a', 'b');
    setElements([a, b, ar]);
    setSelection(['a']);
    deleteSelection();
    expect(ids()).toEqual(['b', 'ar']);
    const frozen = getState().elements.find((e) => e.id === 'ar') as ArrowElement;
    expect(frozen.startBinding).toBeNull();
    expect(frozen.endBinding?.elementId).toBe('b');
    expect(getState().selectedIds).toEqual([]);
    undo();
    expect(getState().elements).toEqual([a, b, ar]);
    expect(getState().selectedIds).toEqual(['a']);
  });
  it('clears hoverId and bindTarget', () => {
    setElements([rect('a', 0, 0)]);
    setSelection(['a']);
    setInteraction({ hoverId: 'a', bindTarget: { elementId: 'a', focus: { x: 0, y: 0 } } });
    deleteSelection();
    expect(getState().interaction.hoverId).toBeNull();
    expect(getState().interaction.bindTarget).toBeNull();
  });
  it('cut copies then deletes (and clears hover)', () => {
    setElements([rect('a', 0, 0)]);
    setSelection(['a']);
    setInteraction({ hoverId: 'a' });
    const s = cutSelection();
    expect(s).not.toBeNull();
    expect(ids()).toEqual([]);
    expect(getState().interaction.hoverId).toBeNull();
    expect(pasteClipboard()).toBe(true);
    expect(ids()).toHaveLength(1);
  });
  it('does nothing and records nothing for an empty selection', () => {
    setElements([rect('a', 0, 0)]);
    deleteSelection();
    expect(ids()).toEqual(['a']);
    expect(getHistorySizes().past).toBe(0);
  });
});

describe('duplicate, nudge, reorder', () => {
  it('duplicate selects the copies, offset by DUPLICATE_OFFSET', () => {
    setElements([rect('a', 0, 0)]);
    setSelection(['a']);
    duplicateSelection();
    expect(ids()).toHaveLength(2);
    const copy = getState().elements[1] as ShapeElement;
    expect(getState().selectedIds).toEqual([copy.id]);
    expect(copy.id).not.toBe('a');
    expect(copy.x).toBe(DUPLICATE_OFFSET);
    expect(copy.y).toBe(DUPLICATE_OFFSET);
    undo();
    expect(ids()).toEqual(['a']);
  });
  it('rapid nudges merge into one undo entry', () => {
    setElements([rect('a', 0, 0)]);
    setSelection(['a']);
    nudgeSelection(1, 0);
    nudgeSelection(1, 0);
    nudgeSelection(1, 0);
    expect((getState().elements[0] as ShapeElement).x).toBe(3);
    expect(getHistorySizes().past).toBe(1);
    undo();
    expect((getState().elements[0] as ShapeElement).x).toBe(0);
  });
  it('reorder front moves the selection to the top, one undo step', () => {
    setElements([rect('a', 0, 0), rect('b', 10, 0), rect('c', 20, 0)]);
    setSelection(['a']);
    reorderSelection('front');
    expect(ids()).toEqual(['b', 'c', 'a']);
    undo();
    expect(ids()).toEqual(['a', 'b', 'c']);
  });
});

describe('applyStyle', () => {
  it('updates the selection and currentStyle with one history entry, merging by key', () => {
    setElements([rect('a', 0, 0)]);
    setSelection(['a']);
    applyStyle({ opacity: 50 }, 'opacity');
    applyStyle({ opacity: 40 }, 'opacity');
    expect(getState().currentStyle.opacity).toBe(40);
    expect(getState().elements[0]!.style.opacity).toBe(40);
    expect(getHistorySizes().past).toBe(1);
    undo();
    expect(getState().elements[0]!.style.opacity).toBe(100);
  });
  it('with nothing selected only changes currentStyle and records nothing', () => {
    setElements([rect('a', 0, 0)]);
    applyStyle({ strokeColor: '#e03131' });
    expect(getState().currentStyle.strokeColor).toBe('#e03131');
    expect(getState().elements[0]!.style.strokeColor).toBe(DEFAULT_STYLE.strokeColor);
    expect(getHistorySizes().past).toBe(0);
  });
  it('while editing keeps editing, restyles the element, and adds no entry until commit', () => {
    const t = text('t', 'hi');
    setElements([t]);
    setSelection(['t']);
    startEditing('t');
    applyStyle({ strokeColor: '#2f9e44' });
    expect(getState().editing?.id).toBe('t');
    expect(getState().elements[0]!.style.strokeColor).toBe('#2f9e44');
    expect(getState().currentStyle.strokeColor).toBe('#2f9e44');
    expect(getHistorySizes().past).toBe(0);
    commitEditing();
    expect(getHistorySizes().past).toBe(1);
    undo();
    expect(getState().elements[0]!.style.strokeColor).toBe(DEFAULT_STYLE.strokeColor);
  });
});

describe('placeShape', () => {
  it('creates the default size centered at the world point, selects it, one undo step, back to select', () => {
    setTool('ellipse');
    const id = placeShape('rectangle', { x: 500, y: 400 });
    const el = getState().elements[0] as ShapeElement;
    expect(el.id).toBe(id);
    expect(el.shape).toBe('rectangle');
    expect(el.x).toBeCloseTo(500 - 80);
    expect(el.y).toBeCloseTo(400 - 50);
    expect(el.width).toBe(160);
    expect(el.height).toBe(100);
    expect(getState().selectedIds).toEqual([id]);
    expect(getState().tool).toBe('select');
    expect(getHistorySizes().past).toBe(1);
  });
  it('honours the viewport', () => {
    setState({ viewport: { scrollX: -100, scrollY: 0, zoom: 2 } });
    placeShape('rectangle', { x: 400, y: 200 }); // world = (400/2 + 100, 100) = (300, 100)
    const b = getBounds(getState().elements[0]!);
    expect(b.x + b.width / 2).toBeCloseTo(300);
    expect(b.y + b.height / 2).toBeCloseTo(100);
  });
});

describe('paste', () => {
  it('chalk JSON pastes clones with fresh ids and selects them', () => {
    setElements([rect('a', 0, 0)]);
    setSelection(['a']);
    const json = copySelection()!;
    setSelection([]);
    expect(pasteText(json)).toBe(true);
    expect(getState().elements).toHaveLength(2);
    const clone = getState().elements[1]!;
    expect(clone.id).not.toBe('a');
    expect(getState().selectedIds).toEqual([clone.id]);
    expect((clone as ShapeElement).x).toBe(DUPLICATE_OFFSET);
  });
  it('centers pasted elements on the last pointer position when known', () => {
    setElements([rect('a', 0, 0, 100, 60)]);
    setSelection(['a']);
    const json = copySelection()!;
    setLastPointerWorld({ x: 400, y: 300 });
    pasteText(json);
    const b = getBounds(getState().elements[1]!);
    expect(b.x + b.width / 2).toBeCloseTo(400);
    expect(b.y + b.height / 2).toBeCloseTo(300);
  });
  it('plain text creates a text element', () => {
    setLastPointerWorld({ x: 50, y: 60 });
    expect(pasteText('hello\r\nworld')).toBe(true);
    const el = getState().elements[0] as TextElement;
    expect(el.type).toBe('text');
    expect(el.text).toBe('hello\nworld');
    expect(getState().selectedIds).toEqual([el.id]);
    expect(getHistorySizes().past).toBe(1);
  });
  it('blank text, a scene with no elements and a malformed scene return false', () => {
    expect(pasteText('   \n')).toBe(false);
    expect(pasteText(JSON.stringify(toSceneFile([])))).toBe(false);
    expect(pasteText(JSON.stringify({ type: 'chalk/scene', version: 99, elements: [] }))).toBe(false);
    expect(getState().elements).toEqual([]);
  });
});

describe('text editing', () => {
  it('createTextAt starts editing an empty text; committing it empty deletes it with no history', () => {
    const id = createTextAt({ x: 100, y: 100 });
    expect(getState().editing?.id).toBe(id);
    expect(getState().selectedIds).toEqual([id]);
    commitEditing();
    expect(getState().editing).toBeNull();
    expect(ids()).toEqual([]);
    expect(getHistorySizes().past).toBe(0);
  });
  it('create + type gives exactly one undo step; commit is idempotent', () => {
    const id = createTextAt({ x: 100, y: 100 });
    updateEditingText('a');
    updateEditingText('ab');
    expect(getHistorySizes().past).toBe(0);
    commitEditing();
    commitEditing();
    expect(getHistorySizes().past).toBe(1);
    expect((getState().elements[0] as TextElement).text).toBe('ab');
    expect(getState().selectedIds).toEqual([id]);
    undo();
    expect(ids()).toEqual([]);
  });
  it('committing while the text tool is active returns to select unless locked', () => {
    setTool('text');
    createTextAt({ x: 0, y: 0 });
    updateEditingText('x');
    commitEditing();
    expect(getState().tool).toBe('select');
  });
  it('trims trailing whitespace of a shape label on commit', () => {
    setElements([{ ...rect('a', 0, 0, 200, 100), label: 'hi  \n' }]);
    startEditing('a');
    commitEditing();
    expect((getState().elements[0] as ShapeElement).label).toBe('hi');
    expect(getHistorySizes().past).toBe(1);
  });
  it('undo and redo are blocked while editing or during a gesture', () => {
    setElements([rect('a', 0, 0)]);
    setSelection(['a']);
    nudgeSelection(5, 0);
    expect(getState().canUndo).toBe(true);
    startEditing('a');
    undo();
    expect((getState().elements[0] as ShapeElement).x).toBe(5);
    commitEditing();
    setInteraction({ gestureActive: true });
    undo();
    expect((getState().elements[0] as ShapeElement).x).toBe(5);
    setInteraction({ gestureActive: false });
    undo();
    expect((getState().elements[0] as ShapeElement).x).toBe(0);
    setInteraction({ gestureActive: true });
    redo();
    expect((getState().elements[0] as ShapeElement).x).toBe(0);
  });
  it('openDialog commits editing first', () => {
    createTextAt({ x: 0, y: 0 });
    updateEditingText('keep');
    openDialog('help');
    expect(getState().editing).toBeNull();
    expect(getState().dialog).toBe('help');
    expect(ids()).toHaveLength(1);
    closeDialog();
    expect(getState().dialog).toBe('none');
  });
  it('editSelection edits exactly one selected element', () => {
    setElements([rect('a', 0, 0), rect('b', 200, 0)]);
    setSelection(['a', 'b']);
    expect(editSelection()).toBe(false);
    setSelection(['b']);
    expect(editSelection()).toBe(true);
    expect(getState().editing?.id).toBe('b');
  });
  it('starting to edit another element commits the first', () => {
    setElements([rect('a', 0, 0), rect('b', 200, 0)]);
    startEditing('a');
    startEditing('b');
    expect(getState().editing?.id).toBe('b');
    expect(getState().selectedIds).toEqual(['b']);
  });
});

describe('view', () => {
  it('zoom commands scale about the viewport center and are reversible', () => {
    setState({ viewportSize: { width: 800, height: 600 } });
    zoomIn();
    expect(getState().viewport.zoom).toBeCloseTo(1.2);
    // the world point under the center stays fixed
    const v = getState().viewport;
    expect(400 / v.zoom - v.scrollX).toBeCloseTo(400);
    zoomOut();
    expect(getState().viewport.zoom).toBeCloseTo(1);
    zoomIn();
    resetZoom();
    expect(getState().viewport.zoom).toBe(1);
  });
  it('zoomToFit on an empty board is the identity viewport', () => {
    setState({ viewportSize: { width: 800, height: 600 }, viewport: { scrollX: 5, scrollY: 5, zoom: 3 } });
    zoomToFit();
    expect(getState().viewport).toEqual({ scrollX: 0, scrollY: 0, zoom: 1 });
  });
  it('zoomToSelection falls back to zoomToFit with no selection', () => {
    setState({ viewportSize: { width: 800, height: 600 }, viewport: { scrollX: 5, scrollY: 5, zoom: 3 } });
    zoomToSelection();
    expect(getState().viewport).toEqual({ scrollX: 0, scrollY: 0, zoom: 1 });
  });
});
