// Alt+Shift+Up / Down moves the top-level block holding the selection (Notion's block move, without a drag handle).
import { Extension } from '@tiptap/core';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { NodeSelection, Selection, TextSelection } from '@tiptap/pm/state';

/** A ProseMirror command that swaps the selection's top-level block with its neighbour. Returns true (handled) even at the ends. */
export function moveBlock(dir: -1 | 1) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
    const { doc, selection } = state;
    const $from = selection.$from;
    if ($from.depth === 0 && !(selection instanceof NodeSelection)) return true;
    const index = $from.index(0);
    const target = index + dir;
    if (target < 0 || target >= doc.childCount) return true;
    const block = doc.child(index);
    const other = doc.child(target);
    const start = $from.depth === 0 ? selection.from : $from.before(1);
    const tr = state.tr;
    let insertAt: number;
    if (dir < 0) {
      insertAt = start - other.nodeSize;
      tr.delete(start, start + block.nodeSize).insert(insertAt, block);
    } else {
      insertAt = start + other.nodeSize;
      tr.delete(start, start + block.nodeSize).insert(insertAt, block);
    }
    const delta = insertAt - start;
    if (selection instanceof NodeSelection) tr.setSelection(NodeSelection.create(tr.doc, selection.from + delta));
    else if (selection instanceof TextSelection) tr.setSelection(TextSelection.create(tr.doc, selection.anchor + delta, selection.head + delta));
    else tr.setSelection(Selection.near(tr.doc.resolve(Math.min(tr.doc.content.size, Math.max(0, selection.from + delta)))));
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

export const BlockMove = Extension.create({
  name: 'blockMove',
  addKeyboardShortcuts() {
    return {
      'Alt-Shift-ArrowUp': () => moveBlock(-1)(this.editor.state, this.editor.view.dispatch),
      'Alt-Shift-ArrowDown': () => moveBlock(1)(this.editor.state, this.editor.view.dispatch),
    };
  },
});
