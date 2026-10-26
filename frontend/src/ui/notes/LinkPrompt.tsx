// Ctrl+K: a small inline URL prompt under the selection. Enter applies (empty removes the link), Esc cancels.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { normalizeLinkUrl } from '../../core/notesView';
import { TID } from '../../testids';

export interface LinkPromptState { left: number; top: number; initial: string }

/** Where to show the prompt and what to prefill, from the editor's current selection. */
export function openLinkPrompt(editor: Editor): LinkPromptState {
  const { from } = editor.state.selection;
  const c = editor.view.coordsAtPos(from);
  return { left: c.left, top: c.bottom + 6, initial: String(editor.getAttributes('link').href ?? '') };
}

export function applyLink(editor: Editor, raw: string): void {
  const href = normalizeLinkUrl(raw);
  const chain = editor.chain().focus();
  if (href === '') {
    chain.extendMarkRange('link').unsetLink().run();
  } else if (editor.state.selection.empty && !editor.isActive('link')) {
    chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
  } else {
    chain.extendMarkRange('link').setLink({ href }).run();
  }
}

export function LinkPrompt(props: { editor: Editor; state: LinkPromptState; onClose: () => void }) {
  const { editor, state, onClose } = props;
  const [value, setValue] = useState(state.initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const left = Math.max(8, Math.min(state.left, window.innerWidth - 328));
  return createPortal(
    <div className="notes-link-prompt" style={{ left, top: state.top }}>
      <input
        ref={ref}
        className="notes-link-input"
        data-testid={TID.notesLinkInput}
        value={value}
        placeholder="Paste or type a link, Enter to apply"
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            applyLink(editor, value);
            onClose();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            editor.commands.focus();
            onClose();
          }
        }}
        onBlur={onClose}
      />
    </div>,
    document.body,
  );
}
