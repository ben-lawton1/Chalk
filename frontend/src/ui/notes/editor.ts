// The notes editor's extension list (Tiptap 3, MIT packages only). One place to add a block, a mark or a keyboard shortcut.
import type { Extensions } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { Highlight } from '@tiptap/extension-highlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { StarterKit } from '@tiptap/starter-kit';
import { BlockMove } from './extensions/blockMove';
import { Callout } from './extensions/callout';
import { NotesFallbackKeys, NotesKeys } from './extensions/keys';
import { lowlight } from './extensions/lowlight';
import { MarkdownRules } from './extensions/markdownRules';
import { NOTES_SUGGESTION_EXTENSIONS } from './suggestions';

export const NOTES_PLACEHOLDER = "Type '/' for commands, '@' to link a page";

export interface NotesExtensionOptions {
  /** Ctrl+K handler (opens the inline link prompt). */
  onLinkShortcut: () => void;
  /** Extra extensions appended last (default: the suggestion menus of N-C). */
  extra?: Extensions;
}

export function createNotesExtensions(opts: NotesExtensionOptions): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false, // replaced by the lowlight version below
      link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https' },
    }),
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: 'plaintext' }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Details.configure({ persist: true }),
    DetailsSummary,
    DetailsContent,
    Callout,
    Placeholder.configure({
      showOnlyCurrent: true,
      placeholder: ({ node, editor, pos }) => {
        if (node.type.name === 'heading') return `Heading ${String(node.attrs.level)}`;
        if (node.type.name !== 'paragraph') return '';
        return editor.state.doc.resolve(pos).depth === 0 ? NOTES_PLACEHOLDER : '';
      },
    }),
    MarkdownRules,
    BlockMove,
    NotesKeys.configure({ onLinkShortcut: opts.onLinkShortcut }),
    NotesFallbackKeys,
    ...(opts.extra ?? NOTES_SUGGESTION_EXTENSIONS),
  ];
}
