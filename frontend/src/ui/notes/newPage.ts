// "New page": creates a page in the current section through the existing API without opening it, then links it at the caret.
import type { Editor } from '@tiptap/core';
import { createPageQuietly } from '../../persistence/library';
import { notify } from '../../state/store';

export async function insertNewPageLink(editor: Editor, name?: string): Promise<void> {
  try {
    const page = await createPageQuietly(name);
    if (editor.isDestroyed) return;
    editor.chain().focus().insertContent([{ type: 'pageLink', attrs: { id: page.id, label: page.name } }, { type: 'text', text: ' ' }]).run();
  } catch {
    notify('Could not create the page', 'error');
  }
}
