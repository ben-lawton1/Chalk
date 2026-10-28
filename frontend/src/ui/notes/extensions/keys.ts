// Notes keyboard shortcuts that are not Tiptap defaults. Two extensions because they need different priorities:
// the first must run before list/table Tab handling; the second must run after suggestion menus (so a menu eats Esc and Tab first).
import { Extension } from '@tiptap/core';
import { leaveNotesMode } from '../../../state/actions';

export interface NotesKeysOptions {
  /** Ctrl+K: open the inline link prompt. */
  onLinkShortcut: () => void;
}

/** Ctrl+K and Tab inside a code block (two spaces). */
export const NotesKeys = Extension.create<NotesKeysOptions>({
  name: 'notesKeys',
  priority: 200,

  addOptions() {
    return { onLinkShortcut: () => undefined };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-k': () => {
        this.options.onLinkShortcut();
        return true;
      },
      Tab: ({ editor }) => (editor.isActive('codeBlock') ? editor.commands.insertContent('  ') : false),
      'Shift-Tab': ({ editor }) => editor.isActive('codeBlock'),
    };
  },
});

/** Esc leaves notes mode, and Tab never moves focus out of the editor. Lowest priority so menus and lists get the key first. */
export const NotesFallbackKeys = Extension.create({
  name: 'notesFallbackKeys',
  priority: 1,

  addKeyboardShortcuts() {
    return {
      Escape: () => {
        leaveNotesMode();
        return true;
      },
      Tab: () => true,
      'Shift-Tab': () => true,
    };
  },
});
