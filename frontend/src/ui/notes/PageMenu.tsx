// The page picker behind `@`, `[[` and `/page`: pages from the library tree (current section first, then the current notebook; the current
// page is left out), and a last row that creates a new page in the current section (without opening it) and links it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { rankPages } from '../../core/pageLinks';
import type { PageEntry } from '../../core/pageLinks';
import { TID, tidPageItem } from '../../testids';
import { useAppState } from '../hooks';
import { setMenuKeyHandler } from './menuBridge';
import type { MenuState } from './menuBridge';
import { MenuPopup } from './MenuPopup';
import { insertNewPageLink } from './newPage';

type Row = { kind: 'page'; page: PageEntry } | { kind: 'new' };

export function PageMenu(props: { menu: MenuState }) {
  const { menu } = props;
  const { editor, query } = menu;
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const library = useAppState((s) => s.library);
  const board = useAppState((s) => s.board);
  const rows = useMemo<Row[]>(() => {
    const pages = rankPages(library, query, { id: board?.id ?? null, notebook: board?.notebook ?? '', section: board?.section ?? '' });
    return [...pages.map((page): Row => ({ kind: 'page', page })), { kind: 'new' }];
  }, [library, board?.id, board?.notebook, board?.section, query]);

  const [sel, setSel] = useState({ q: query, i: 0 });
  const index = sel.q === query ? Math.min(sel.i, rows.length - 1) : 0;
  const indexRef = useRef(index);
  indexRef.current = index;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const listRef = useRef<HTMLDivElement>(null);

  const select = (i: number): void => {
    indexRef.current = i;
    setSel({ q: menuRef.current.query, i });
  };

  function pick(row: Row): void {
    const m = menuRef.current;
    if (row.kind === 'page') {
      editor
        .chain()
        .focus()
        .deleteRange(m.range)
        .insertContent([{ type: 'pageLink', attrs: { id: row.page.id, label: row.page.name } }, { type: 'text', text: ' ' }])
        .run();
    } else {
      editor.chain().focus().deleteRange(m.range).run();
      void insertNewPageLink(editor, m.query.trim());
    }
  }
  const pickRef = useRef(pick);
  pickRef.current = pick;

  useEffect(() => {
    setMenuKeyHandler((e) => {
      const list = rowsRef.current;
      const n = list.length;
      const down = e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey);
      const up = e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey);
      if (down || up) {
        select((indexRef.current + (down ? 1 : n - 1)) % n);
        return true;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        const row = list[indexRef.current];
        if (row) pickRef.current(row);
        return true;
      }
      return false;
    });
    return () => setMenuKeyHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index, rows]);


  const q = query.trim();
  return (
    <MenuPopup
      anchor={() => {
        const c = editor.view.coordsAtPos(menu.range.from);
        return { left: c.left, top: c.top, bottom: c.bottom };
      }}
      className="page-menu"
      testId={TID.pageMenu}
    >
      <div ref={listRef} className="notes-menu-list" role="listbox">
        <div className="notes-menu-group">Link to page</div>
        {rows.map((row, i) =>
          row.kind === 'page' ? (
            <div
              key={row.page.id}
              role="option"
              aria-selected={i === index}
              className="notes-menu-row"
              data-active={i === index ? 'true' : 'false'}
              data-testid={tidPageItem(row.page.id)}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => select(i)}
              onClick={() => pick(row)}
            >
              <span className="notes-menu-icon">▤</span>
              <span className="notes-menu-text">
                <span className="notes-menu-title">{row.page.name}</span>
                <span className="notes-menu-desc">
                  {row.page.notebook} › {row.page.section}
                </span>
              </span>
            </div>
          ) : (
            <div
              key="new"
              role="option"
              aria-selected={i === index}
              className="notes-menu-row notes-menu-new"
              data-active={i === index ? 'true' : 'false'}
              data-testid={TID.pageMenuNew}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => select(i)}
              onClick={() => pick(row)}
            >
              <span className="notes-menu-icon">+</span>
              <span className="notes-menu-text">
                <span className="notes-menu-title">{q === '' ? 'New page' : `New page "${q}"`}</span>
              </span>
            </div>
          ),
        )}
      </div>
    </MenuPopup>
  );
}
