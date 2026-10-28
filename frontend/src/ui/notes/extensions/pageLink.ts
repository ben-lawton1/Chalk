// The page link chip: an inline atom node { id, label }. It shows the page's live name (looked up by id in AppState.library, so renames
// show up), falls back to the stored label, and shows a page that no longer exists struck through. Clicking it opens the page, in and
// out of notes mode (the CSS keeps `.page-link` clickable in an inactive column). core/notes.ts reads `attrs.label` for plain text.
import { Node, mergeAttributes } from '@tiptap/core';
import { resolvePageLink } from '../../../core/pageLinks';
import { openBoard } from '../../../persistence/boards';
import { getState, notify, subscribe } from '../../../state/store';
import { TID } from '../../../testids';

const ICON_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3.5h7l4 4V20.5H7z M14 3.5v4h4"/></svg>';

export const PageLink = Node.create({
  name: 'pageLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      id: { default: '', parseHTML: (el) => el.getAttribute('data-page-link') ?? '', renderHTML: () => ({}) },
      label: { default: '', parseHTML: (el) => el.getAttribute('data-label') ?? el.textContent ?? '', renderHTML: () => ({}) },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-page-link]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'page-link', 'data-page-link': String(node.attrs.id), 'data-label': String(node.attrs.label) }),
      String(node.attrs.label),
    ];
  },

  renderText({ node }) {
    return String(node.attrs.label);
  },

  addNodeView() {
    return ({ node }) => {
      let current = node;
      const dom = document.createElement('span');
      dom.className = 'page-link';
      dom.setAttribute('data-testid', TID.pageLink);
      dom.contentEditable = 'false';
      const icon = document.createElement('span');
      icon.className = 'page-link-icon';
      icon.innerHTML = ICON_SVG; // a constant string, no user data
      const text = document.createElement('span');
      text.className = 'page-link-text';
      dom.append(icon, text);

      let lastLibrary = getState().library;
      const paint = (): void => {
        const r = resolvePageLink(getState().library, String(current.attrs.id), String(current.attrs.label));
        text.textContent = r.name;
        dom.setAttribute('data-missing', r.exists ? 'false' : 'true');
        dom.setAttribute('data-page-id', String(current.attrs.id));
        dom.title = r.exists ? (r.path ? `${r.name} (${r.path})` : r.name) : 'Page not found';
      };
      paint();
      const unsubscribe = subscribe((s) => {
        if (s.library === lastLibrary) return;
        lastLibrary = s.library;
        paint();
      });

      dom.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = String(current.attrs.id);
        const r = resolvePageLink(getState().library, id, String(current.attrs.label));
        if (!r.exists) {
          notify('Page not found', 'error');
          return;
        }
        if (getState().board?.id === id) return;
        openBoard(id).catch(() => notify('Could not open that page', 'error'));
      });

      return {
        dom,
        update(next) {
          if (next.type !== current.type) return false;
          current = next;
          paint();
          return true;
        },
        stopEvent: (event: Event) => event.type === 'click',
        ignoreMutation: () => true,
        destroy: unsubscribe,
      };
    };
  },
});
