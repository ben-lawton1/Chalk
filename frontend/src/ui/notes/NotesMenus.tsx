// Everything that floats over the notes editor: the slash menu, the page picker, and the table cell toolbar.
import { useEffect, useReducer, useSyncExternalStore } from 'react';
import type { Editor } from '@tiptap/core';
import { TID, tidTableAction } from '../../testids';
import { useAppState } from '../hooks';
import { getMenu, subscribeMenu } from './menuBridge';
import { MenuPopup } from './MenuPopup';
import { PageMenu } from './PageMenu';
import { SlashMenu } from './SlashMenu';

const TABLE_ACTIONS: readonly { id: string; label: string; title: string; run: (e: Editor) => boolean }[] = [
  { id: 'row-above', label: '↑ Row', title: 'Insert row above', run: (e) => e.chain().focus().addRowBefore().run() },
  { id: 'row-below', label: '↓ Row', title: 'Insert row below', run: (e) => e.chain().focus().addRowAfter().run() },
  { id: 'col-left', label: '← Col', title: 'Insert column left', run: (e) => e.chain().focus().addColumnBefore().run() },
  { id: 'col-right', label: '→ Col', title: 'Insert column right', run: (e) => e.chain().focus().addColumnAfter().run() },
  { id: 'delete-row', label: 'Delete row', title: 'Delete row', run: (e) => e.chain().focus().deleteRow().run() },
  { id: 'delete-col', label: 'Delete col', title: 'Delete column', run: (e) => e.chain().focus().deleteColumn().run() },
  { id: 'delete-table', label: 'Delete table', title: 'Delete table', run: (e) => e.chain().focus().deleteTable().run() },
];

/** Shown above the table while the caret is in one (notes mode on). */
function TableToolbar(props: { editor: Editor }) {
  const { editor } = props;
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const active = useAppState((s) => s.notesActive);
  useEffect(() => {
    editor.on('transaction', rerender);
    editor.on('focus', rerender);
    editor.on('blur', rerender);
    return () => {
      editor.off('transaction', rerender);
      editor.off('focus', rerender);
      editor.off('blur', rerender);
    };
  }, [editor]);

  if (!active || editor.isDestroyed || !editor.isActive('table')) return null;
  return (
    <MenuPopup
      className="table-toolbar"
      testId={TID.tableToolbar}
      prefer="above"
      anchor={() => {
        const at = editor.view.domAtPos(editor.state.selection.from).node;
        const el = at instanceof Element ? at : at.parentElement;
        const table = el?.closest('table');
        if (!table) return null;
        const r = table.getBoundingClientRect();
        return { left: r.left, top: r.top, bottom: r.bottom };
      }}
    >
      {TABLE_ACTIONS.map((a) => (
        <button
          key={a.id}
          type="button"
          className={`table-toolbar-btn${a.id.startsWith('delete') ? ' danger' : ''}`}
          title={a.title}
          data-testid={tidTableAction(a.id)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => a.run(editor)}
        >
          {a.label}
        </button>
      ))}
    </MenuPopup>
  );
}

export function NotesMenus(props: { editor: Editor; onLinkPrompt: (editor: Editor) => void }) {
  const { editor, onLinkPrompt } = props;
  const menu = useSyncExternalStore(subscribeMenu, getMenu, getMenu);
  const mine = menu && menu.editor === editor ? menu : null;
  return (
    <>
      {mine?.kind === 'slash' && <SlashMenu menu={mine} onLinkPrompt={onLinkPrompt} />}
      {mine?.kind === 'page' && <PageMenu menu={mine} />}
      <TableToolbar editor={editor} />
    </>
  );
}
