// Markdown shortcuts that Tiptap's own extensions lack: Notion's `" ` quote and the `>> ` toggle list.
// (`[] `, `[ ] ` and `[x] ` are already TaskItem's own input rule; `> `, `- `, `1. `, `#`, `---`, ``` and the mark rules too.)
import { Extension, InputRule, wrappingInputRule } from '@tiptap/core';

const LIST_ITEM_TYPES: ReadonlySet<string> = new Set(['listItem', 'taskItem']);

export const MarkdownRules = Extension.create({
  name: 'markdownRules',

  addInputRules() {
    const rules: InputRule[] = [];
    const blockquote = this.editor.schema.nodes.blockquote;
    if (blockquote) rules.push(wrappingInputRule({ find: /^\s*["“”]\s$/, type: blockquote }));
    if (this.editor.schema.nodes.details) {
      rules.push(
        new InputRule({
          find: /^\s*>>\s$/,
          handler: ({ state, range, chain }) => {
            // Wrapping a list item in a toggle mis-places the caret, so the rule simply does not fire inside list items.
            const { $from } = state.selection;
            for (let d = $from.depth; d > 0; d--) if (LIST_ITEM_TYPES.has($from.node(d).type.name)) return null;
            chain().deleteRange(range).setDetails().run();
          },
        }),
      );
    }
    return rules;
  },
});
