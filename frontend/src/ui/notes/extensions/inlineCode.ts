// `/inline` turns the code mark on for the next typed text. It ends with Ctrl+E (Tiptap's own shortcut) or when the next backtick is typed.
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

export const InlineCodeKeys = Extension.create({
  name: 'inlineCodeKeys',

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handleTextInput(_view, _from, _to, text) {
            if (text !== '`' || !editor.state.selection.empty || !editor.isActive('code')) return false;
            return editor.commands.unsetMark('code');
          },
        },
      }),
    ];
  },
});
