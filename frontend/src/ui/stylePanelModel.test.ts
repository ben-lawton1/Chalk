// Unit tests for the style panel model (visibility, sections per kind/tool, displayed values). Owner: WP4.
import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../constants';
import type { ArrowElement, ChalkElement, ShapeElement, Style, TextElement, ToolId } from '../types';
import { getPanelModel } from './stylePanelModel';

function shape(id: string, kind: ShapeElement['shape'] = 'rectangle', style: Partial<Style> = {}): ShapeElement {
  return { id, seed: 1, type: 'shape', shape: kind, x: 0, y: 0, width: 100, height: 60, label: '', style: { ...DEFAULT_STYLE, ...style } };
}
function textEl(id: string, style: Partial<Style> = {}): TextElement {
  return { id, seed: 1, type: 'text', x: 0, y: 0, width: 50, height: 30, text: 'hi', autoResize: true, style: { ...DEFAULT_STYLE, ...style } };
}
function arrowEl(id: string, style: Partial<Style> = {}): ArrowElement {
  return { id, seed: 1, type: 'arrow', start: { x: 0, y: 0 }, end: { x: 10, y: 10 }, startBinding: null, endBinding: null, label: '', style: { ...DEFAULT_STYLE, ...style } };
}
function model(elements: ChalkElement[], selectedIds: string[], tool: ToolId = 'select', currentStyle: Style = DEFAULT_STYLE) {
  return getPanelModel({ elements, selectedIds, tool, currentStyle });
}

describe('getPanelModel visibility', () => {
  it('is hidden for select/hand with nothing selected', () => {
    for (const tool of ['select', 'hand'] as const) {
      const m = model([shape('a')], [], tool);
      expect(m.visible).toBe(false);
      expect(Object.values(m.sections).every((v) => v === false)).toBe(true);
    }
  });
  it('is visible for every drawing tool', () => {
    for (const tool of ['rectangle', 'diamond', 'ellipse', 'triangle', 'arrow', 'line', 'text'] as const) {
      expect(model([], [], tool).visible).toBe(true);
    }
  });
  it('is visible when something is selected, even with the select tool', () => {
    expect(model([shape('a')], ['a']).visible).toBe(true);
  });
  it('ignores selected ids that no longer exist', () => {
    expect(model([shape('a')], ['gone']).visible).toBe(false);
  });
});

describe('getPanelModel sections from the selection', () => {
  it('rectangle selection', () => {
    const s = model([shape('a')], ['a']).sections;
    expect(s).toMatchObject({
      stroke: true, background: true, fill: true, strokeWidth: true, strokeStyle: true, roughness: true, edges: true,
      arrowheads: false, fontSize: true, fontFamily: true, textAlign: false, opacity: true, layers: true,
    });
  });
  it('non-rectangle shape has no edges section', () => {
    expect(model([shape('a', 'ellipse')], ['a']).sections.edges).toBe(false);
  });
  it('text selection', () => {
    const s = model([textEl('t')], ['t']).sections;
    expect(s).toMatchObject({
      stroke: true, background: false, fill: false, strokeWidth: false, strokeStyle: false, roughness: false, edges: false,
      arrowheads: false, fontSize: true, fontFamily: true, textAlign: true, opacity: true, layers: true,
    });
  });
  it('arrow selection shows arrowheads even for line-like arrows', () => {
    const s = model([arrowEl('r')], ['r'], 'line').sections;
    expect(s).toMatchObject({ background: false, fill: false, strokeWidth: true, strokeStyle: true, roughness: true, arrowheads: true, fontSize: true, textAlign: false });
  });
  it('mixed selection takes the union', () => {
    const s = model([shape('a'), textEl('t'), arrowEl('r')], ['a', 't', 'r']).sections;
    expect(s).toMatchObject({ background: true, edges: true, arrowheads: true, textAlign: true, layers: true });
  });
});

describe('getPanelModel sections from the tool (nothing selected)', () => {
  it('rectangle tool', () => {
    const s = model([], [], 'rectangle').sections;
    expect(s).toMatchObject({ background: true, fill: true, edges: true, arrowheads: false, textAlign: false, layers: false, fontSize: true });
  });
  it('ellipse tool has no edges', () => {
    expect(model([], [], 'ellipse').sections.edges).toBe(false);
  });
  it('arrow tool shows arrowheads, line tool hides them', () => {
    expect(model([], [], 'arrow').sections.arrowheads).toBe(true);
    expect(model([], [], 'line').sections.arrowheads).toBe(false);
    expect(model([], [], 'line').sections.strokeWidth).toBe(true);
  });
  it('text tool shows text sections only', () => {
    const s = model([], [], 'text').sections;
    expect(s).toMatchObject({ stroke: true, background: false, strokeWidth: false, fontSize: true, fontFamily: true, textAlign: true, opacity: true, layers: false });
  });
});

describe('getPanelModel values', () => {
  it('uses currentStyle when nothing is selected', () => {
    const cs = { ...DEFAULT_STYLE, strokeColor: '#e03131' };
    expect(model([], [], 'rectangle', cs).values).toBe(cs);
  });
  it('uses the first selected element style', () => {
    const els = [shape('a', 'rectangle', { strokeColor: '#2f9e44' }), shape('b', 'rectangle', { strokeColor: '#1971c2' })];
    expect(model(els, ['b', 'a']).values.strokeColor).toBe('#1971c2');
    expect(model(els, ['a', 'b']).values.strokeColor).toBe('#2f9e44');
  });
});
