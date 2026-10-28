// The notes' three Suggestion menus (Tiptap): `/` the slash menu, `@` and `[[` the page picker, plus the pageLink chip node.
// They run at the default priority (100); the Esc and Tab fallbacks in extensions/keys.ts run at priority 1, so an open menu sees
// those keys first (Suggestion's own handleKeyDown closes the menu on Esc, keeps the typed text, and returns true).
// The plugins only decide WHEN a menu is open; the menus themselves are React (SlashMenu.tsx, PageMenu.tsx) in a body portal,
// fed through menuBridge.ts.
import { Extension } from '@tiptap/core';
import type { Extensions } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { Suggestion } from '@tiptap/suggestion';
import { InlineCodeKeys } from './extensions/inlineCode';
import { PageLink } from './extensions/pageLink';
import { clearMenu, handleMenuKey, setMenu } from './menuBridge';
import type { MenuKind } from './menuBridge';

export const SLASH_KEY = new PluginKey('chalkSlashMenu');
export const AT_KEY = new PluginKey('chalkAtMenu');
export const BRACKET_KEY = new PluginKey('chalkBracketMenu');

/** A trigger followed by a space ("a / b", "mail me @ home") is ordinary text, not a menu; a very long query is not either. */
const MAX_PAGE_QUERY = 60;

function renderFor(kind: MenuKind, trigger: string) {
  return () => ({
    onStart: (p: { editor: import('@tiptap/core').Editor; range: { from: number; to: number }; query: string }) =>
      setMenu({ kind, editor: p.editor, range: p.range, query: p.query, trigger }),
    onUpdate: (p: { editor: import('@tiptap/core').Editor; range: { from: number; to: number }; query: string }) =>
      setMenu({ kind, editor: p.editor, range: p.range, query: p.query, trigger }),
    onExit: () => clearMenu(kind),
    onKeyDown: ({ event }: { event: KeyboardEvent }) => handleMenuKey(event),
  });
}

function menuExtension(name: string, pluginKey: PluginKey, kind: MenuKind, trigger: string, maxQuery: number) {
  return Extension.create({
    name,
    addProseMirrorPlugins() {
      return [
        Suggestion({
          pluginKey,
          editor: this.editor,
          char: trigger,
          allowSpaces: true,
          shouldShow: ({ query }) => !query.startsWith(' ') && query.length <= maxQuery,
          allow: ({ state }) => !state.selection.$from.parent.type.spec.code,
          render: renderFor(kind, trigger),
        }),
      ];
    },
  });
}

export const SlashMenuExtension = menuExtension('chalkSlashMenu', SLASH_KEY, 'slash', '/', 40);
export const AtMenuExtension = menuExtension('chalkAtMenu', AT_KEY, 'page', '@', MAX_PAGE_QUERY);
export const BracketMenuExtension = menuExtension('chalkBracketMenu', BRACKET_KEY, 'page', '[[', MAX_PAGE_QUERY);

export const NOTES_SUGGESTION_EXTENSIONS: Extensions = [PageLink, SlashMenuExtension, AtMenuExtension, BracketMenuExtension, InlineCodeKeys];
