// THE SEAM FOR N-C: slash menu, `@` page links and `[[` are Tiptap Suggestion extensions. Add them (and the pageLink chip node)
// to this array; ui/notes/editor.ts appends it to the extension list. Keep the suggestion plugins at the default priority (100):
// the Esc and Tab fallbacks in extensions/keys.ts run at priority 1, so an open menu handles those keys first.
import type { Extensions } from '@tiptap/core';

export const NOTES_SUGGESTION_EXTENSIONS: Extensions = [];
