import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import { moveBlock } from './blockMove';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    quote: { group: 'block', content: 'paragraph+' },
    text: { group: 'inline' },
  },
});
const p = (t: string) => schema.node('paragraph', null, t ? [schema.text(t)] : []);

function run(state: EditorState, dir: -1 | 1): EditorState {
  let out = state;
  moveBlock(dir)(state, (tr: Transaction) => {
    out = state.apply(tr);
  });
  return out;
}
const texts = (s: EditorState): string[] => Array.from({ length: s.doc.childCount }, (_, i) => s.doc.child(i).textContent);

describe('moveBlock', () => {
  const doc = schema.node('doc', null, [p('one'), p('two'), p('three')]);

  it('moves the block down and keeps the caret inside it', () => {
    // caret inside "one" after "o"
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 2) });
    const next = run(state, 1);
    expect(texts(next)).toEqual(['two', 'one', 'three']);
    const $h = next.selection.$head;
    expect($h.parent.textContent).toBe('one');
    expect($h.parentOffset).toBe(1);
  });

  it('moves the block up', () => {
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 7) }); // inside "two"
    const next = run(state, -1);
    expect(texts(next)).toEqual(['two', 'one', 'three']);
    expect(next.selection.$head.parent.textContent).toBe('two');
  });

  it('does nothing at the ends but still reports handled', () => {
    const top = EditorState.create({ doc, selection: TextSelection.create(doc, 2) });
    expect(texts(run(top, -1))).toEqual(['one', 'two', 'three']);
    const bottom = EditorState.create({ doc, selection: TextSelection.create(doc, doc.content.size - 2) });
    expect(texts(run(bottom, 1))).toEqual(['one', 'two', 'three']);
    expect(moveBlock(-1)(top)).toBe(true);
  });

  it('moves a whole top-level wrapper when the caret is nested', () => {
    const d = schema.node('doc', null, [p('a'), schema.node('quote', null, [p('q1'), p('q2')])]);
    // caret inside q2: a(0..3) quote(3..): quote start 3, q1 at 4..8, q2 at 8.. text starts 9
    const state = EditorState.create({ doc: d, selection: TextSelection.create(d, 10) });
    const next = run(state, -1);
    expect(next.doc.child(0).type.name).toBe('quote');
    expect(next.doc.child(1).textContent).toBe('a');
    expect(next.selection.$head.parent.textContent).toBe('q2');
  });
});
