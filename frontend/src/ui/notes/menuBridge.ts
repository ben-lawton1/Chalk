// The bridge between the Tiptap Suggestion plugins (which live inside ProseMirror) and the React menus (which render in a body portal).
// A plugin's render hooks call setMenu / clearMenu; <NotesMenus> reads the state with useSyncExternalStore. Key events the plugin
// receives while a menu is open go to the key handler the open menu registered. Only one menu is open at a time.
import type { Editor, Range } from '@tiptap/core';

export type MenuKind = 'slash' | 'page';

export interface MenuState {
  kind: MenuKind;
  editor: Editor;
  /** The `/query` or `@query` text (trigger character included) in the document. */
  range: Range;
  /** The text typed after the trigger. */
  query: string;
  /** The trigger that opened it: '/', '@' or '[['. */
  trigger: string;
}

let current: MenuState | null = null;
const listeners = new Set<() => void>();

export function getMenu(): MenuState | null {
  return current;
}
export function subscribeMenu(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function emit(): void {
  for (const l of Array.from(listeners)) l();
}

export function setMenu(m: MenuState): void {
  current = m;
  emit();
}

/** Closes the menu, but only if `kind` is still the open one (a plugin that exits after another started must not close the new menu). */
export function clearMenu(kind: MenuKind): void {
  if (current?.kind !== kind) return;
  current = null;
  keyHandler = null;
  emit();
}

type KeyHandler = (e: KeyboardEvent) => boolean;
let keyHandler: KeyHandler | null = null;

export function setMenuKeyHandler(h: KeyHandler | null): void {
  keyHandler = h;
}
/** Called from the plugin's onKeyDown; true means the menu used the key. */
export function handleMenuKey(e: KeyboardEvent): boolean {
  return keyHandler ? keyHandler(e) : false;
}
