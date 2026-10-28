// Callout block: an emoji plus block content, inserted from the slash menu only (no markdown shortcut).
import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /** Wraps the current block in a callout, or lifts it out when already inside one. */
      toggleCallout: () => ReturnType;
    };
  }
}

export const DEFAULT_CALLOUT_EMOJI = '💡';

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      emoji: {
        default: DEFAULT_CALLOUT_EMOJI,
        parseHTML: (el) => el.getAttribute('data-emoji') ?? DEFAULT_CALLOUT_EMOJI,
        renderHTML: (attrs) => ({ 'data-emoji': String(attrs.emoji ?? DEFAULT_CALLOUT_EMOJI) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]', contentElement: '.callout-body' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes({ 'data-callout': '' }, HTMLAttributes),
      ['span', { class: 'callout-emoji', contenteditable: 'false' }, String(HTMLAttributes['data-emoji'] ?? DEFAULT_CALLOUT_EMOJI)],
      ['div', { class: 'callout-body' }, 0],
    ];
  },

  addCommands() {
    return {
      toggleCallout: () => ({ commands }) => commands.toggleWrap(this.name),
    };
  },

  addKeyboardShortcuts() {
    return {
      // Backspace at the very start of a callout takes its first block back out.
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        if (!selection.empty) return false;
        const $from = selection.$from;
        if ($from.parentOffset !== 0 || $from.depth < 2) return false;
        if ($from.node($from.depth - 1).type.name !== this.name || $from.index($from.depth - 1) !== 0) return false;
        return editor.commands.lift(this.name);
      },
    };
  },
});
