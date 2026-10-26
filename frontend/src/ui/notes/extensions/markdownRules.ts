// Markdown shortcuts that Tiptap's own extensions lack: Notion's `" ` quote and the `>> ` toggle list.
// (`[] `, `[ ] ` and `[x] ` are already TaskItem's own input rule; `> `, `- `, `1. `, `#`, `---`, ``` and the mark rules too.)
import { Extension, InputRule, wrappingInputRule } from '@tiptap/core';

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
          handler: ({ range, chain }) => {
            chain().deleteRange(range).setDetails().run();
          },
        }),
      );
    }
    return rules;
  },
});
