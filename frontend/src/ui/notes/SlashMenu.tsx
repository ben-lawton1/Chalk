// The slash menu: a grouped command list at the caret, then (for /table) an in-place size step. Keyboard (Up/Down/Tab/Shift+Tab/Enter) goes
// through menuBridge's key handler while the editor keeps focus; Esc is handled by the Suggestion plugin (closes, keeps the text).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { exitSuggestion } from '@tiptap/suggestion';
import { TABLE_MAX_COLS, TABLE_MAX_ROWS } from '../../constants';
import { TID, tidSlashItem } from '../../testids';
import { SLASH_COMMANDS, clampTableDim, filterCommands, parseTableArgs } from './commands';
import type { SlashCommand, SlashContext } from './commands';
import { setMenuKeyHandler } from './menuBridge';
import type { MenuState } from './menuBridge';
import { MenuPopup } from './MenuPopup';
import { insertNewPageLink } from './newPage';
import { SLASH_KEY } from './suggestions';

function caretAnchor(menu: { editor: Editor; range: { from: number } }) {
  return () => {
    const c = menu.editor.view.coordsAtPos(menu.range.from);
    return { left: c.left, top: c.top, bottom: c.bottom };
  };
}

export function SlashMenu(props: { menu: MenuState; onLinkPrompt: (editor: Editor) => void }) {
  const { menu, onLinkPrompt } = props;
  const { editor, query } = menu;
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const items = useMemo(() => filterCommands(SLASH_COMMANDS, query), [query]);
  const [sel, setSel] = useState({ q: query, i: 0 });
  const [step, setStep] = useState<'list' | 'table'>('list');
  const index = sel.q === query ? Math.min(sel.i, Math.max(items.length - 1, 0)) : 0;
  const indexRef = useRef(index);
  indexRef.current = index;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const listRef = useRef<HTMLDivElement>(null);

  const select = (i: number): void => {
    indexRef.current = i;
    setSel({ q: menuRef.current.query, i });
  };

  function insertTable(rows: number, cols: number, header: boolean): void {
    editor.chain().focus().deleteRange(menuRef.current.range).insertTable({ rows, cols, withHeaderRow: header }).run();
  }

  function pick(cmd: SlashCommand): void {
    const m = menuRef.current;
    if (cmd.id === 'table') {
      const args = parseTableArgs(m.query);
      if (args) {
        insertTable(args.rows, args.cols, true);
        return;
      }
    }
    const ctx: SlashContext = {
      openTableStep: () => setStep('table'),
      openLinkPrompt: () => onLinkPrompt(editor),
      newPage: () => void insertNewPageLink(editor),
    };
    cmd.run(editor, m.range, ctx);
  }
  const pickRef = useRef(pick);
  pickRef.current = pick;

  // Keyboard while the editor has focus (the list step). The table step's inputs handle their own keys.
  useEffect(() => {
    setMenuKeyHandler((e) => {
      if (step !== 'list') return false;
      const list = itemsRef.current;
      const n = list.length;
      const down = e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey);
      const up = e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey);
      if (down || up) {
        if (n > 0) select((indexRef.current + (down ? 1 : n - 1)) % n);
        return true;
      }
      if (e.key === 'Enter' && !e.shiftKey && n > 0) {
        const cmd = list[indexRef.current];
        if (cmd) pickRef.current(cmd);
        return true;
      }
      return false;
    });
    return () => setMenuKeyHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // "No results" shows for one more keystroke; the next one that still finds nothing closes the menu (the text stays).
  const prev = useRef({ query: '', streak: 0 });
  useEffect(() => {
    const empty = items.length === 0;
    const streak = !empty ? 0 : query.length > prev.current.query.length ? prev.current.streak + 1 : prev.current.streak;
    if (streak >= 3) exitSuggestion(editor.view, SLASH_KEY); // shown on the first empty keystroke and one more, closed by the next
    prev.current = { query, streak };
  }, [query, items.length, editor]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index, items]);

  return (
    <MenuPopup anchor={caretAnchor(menu)} className="slash-menu" testId={TID.slashMenu}>
      {step === 'table' ? (
        <TableStep
          editor={editor}
          onInsert={(rows, cols, header) => insertTable(rows, cols, header)}
          onClose={() => {
            exitSuggestion(editor.view, SLASH_KEY);
            editor.view.focus();
          }}
        />
      ) : (
        <div ref={listRef} className="notes-menu-list" role="listbox">
          {items.length === 0 && (
            <div className="notes-menu-empty" data-testid={TID.slashEmpty}>
              No results
            </div>
          )}
          {items.map((cmd, i) => {
            const showGroup = query.trim() === '' && (i === 0 || items[i - 1]?.group !== cmd.group);
            return (
              <div key={cmd.id}>
                {showGroup && <div className="notes-menu-group">{cmd.group}</div>}
                <div
                  role="option"
                  aria-selected={i === index}
                  className="notes-menu-row"
                  data-active={i === index ? 'true' : 'false'}
                  data-testid={tidSlashItem(cmd.id)}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => select(i)}
                  onClick={() => pick(cmd)}
                >
                  <span className="notes-menu-icon">{cmd.icon}</span>
                  <span className="notes-menu-text">
                    <span className="notes-menu-title">{cmd.title}</span>
                    <span className="notes-menu-desc">{cmd.description}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </MenuPopup>
  );
}

// ---------------------------------------------------------------------------
// The /table size step
// ---------------------------------------------------------------------------

function parseDim(text: string, max: number): number {
  return clampTableDim(text === '' ? 1 : Number(text), max);
}

function TableStep(props: { editor: Editor; onInsert: (rows: number, cols: number, header: boolean) => void; onClose: () => void }) {
  const { onInsert, onClose } = props;
  const [rowsText, setRowsText] = useState('3');
  const [colsText, setColsText] = useState('3');
  const [header, setHeader] = useState(true);
  const rowsRef = useRef<HTMLInputElement>(null);
  const colsRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLInputElement>(null);
  const rows = parseDim(rowsText, TABLE_MAX_ROWS);
  const cols = parseDim(colsText, TABLE_MAX_COLS);

  useEffect(() => {
    rowsRef.current?.focus();
    rowsRef.current?.select();
  }, []);

  const setDim = (set: (v: string) => void, max: number) => (e: { target: { value: string } }) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 3);
    set(digits === '' ? '' : String(Math.min(Number(digits), max)));
  };

  function onKeyDown(e: React.KeyboardEvent): void {
    e.stopPropagation(); // global shortcuts (and notes-mode Esc) must not see these keys
    if (e.key === 'Enter') {
      e.preventDefault();
      onInsert(rows, cols, header);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const order = [rowsRef.current, colsRef.current, headerRef.current];
      const at = order.findIndex((el) => el === document.activeElement);
      const next = order[(at + (e.shiftKey ? order.length - 1 : 1)) % order.length];
      next?.focus();
      if (next instanceof HTMLInputElement && next.type === 'text') next.select();
    }
  }

  return (
    <div className="table-step" data-testid={TID.tableStep} onKeyDown={onKeyDown}>
      <div className="notes-menu-group">Insert table</div>
      <div className="table-step-fields">
        <label className="table-step-field">
          <span>Rows</span>
          <input
            ref={rowsRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            data-testid={TID.tableRows}
            value={rowsText}
            onChange={setDim(setRowsText, TABLE_MAX_ROWS)}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
        <span className="table-step-times">×</span>
        <label className="table-step-field">
          <span>Columns</span>
          <input
            ref={colsRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            data-testid={TID.tableCols}
            value={colsText}
            onChange={setDim(setColsText, TABLE_MAX_COLS)}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      </div>
      <label className="table-step-check">
        <input ref={headerRef} type="checkbox" data-testid={TID.tableHeader} checked={header} onChange={(e) => setHeader(e.target.checked)} />
        <span>Header row</span>
      </label>
      <div
        className="table-preview"
        data-testid={TID.tablePreview}
        data-rows={rows}
        data-cols={cols}
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
      >
        {Array.from({ length: rows * cols }, (_, i) => (
          <span key={i} className={header && i < cols ? 'table-preview-cell head' : 'table-preview-cell'} />
        ))}
      </div>
      <div className="table-step-foot">
        <span className="table-step-size">
          {rows} × {cols}
        </span>
        <button type="button" className="table-step-insert" data-testid={TID.tableInsert} onClick={() => onInsert(rows, cols, header)}>
          Insert table
        </button>
      </div>
    </div>
  );
}
