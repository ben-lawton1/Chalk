// OneNote-style left sidebar: one tree Notebook > Section > Page, inline rename, two-click delete, collapsible.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { DELETE_CONFIRM_MS, MAX_BOARD_NAME_LENGTH } from '../constants';
import { openBoard } from '../persistence/boards';
import {
  addNotebook, addPage, addSection, deleteNotebook, deletePage, deleteSection, refreshLibrary, renameNotebook, renamePage,
  renameSection, readSidebarPrefs, writeSidebarPrefs,
} from '../persistence/library';
import type { NewPlace } from '../persistence/library';
import { setSidebarOpen } from '../state/actions';
import { notify } from '../state/store';
import { TID, tidNotebook, tidPage, tidRowAdd, tidRowDelete, tidRowMenu, tidRowRename, tidSection } from '../testids';
import type { LibraryTree } from '../types';
import { useAppState } from './hooks';
import { Icon } from './icons';

export const SIDEBAR_WIDTH_PX = 264;

const nbKey = (nb: string): string => `nb:${nb}`;
const secKey = (nb: string, sec: string): string => `sec:${nb}/${sec}`;
const pageKey = (id: string): string => `page:${id}`;

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Row keys that start with `from` followed by a boundary are re-keyed to `to` (a renamed notebook or section). */
function rekey(keys: Set<string>, from: string, to: string): Set<string> {
  const out = new Set<string>();
  for (const k of keys) {
    if (k === from) out.add(to);
    else if (k.startsWith(from + '/')) out.add(to + k.slice(from.length));
    else out.add(k);
  }
  return out;
}

function RenameInput(props: { initial: string; onCommit: (value: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(props.initial);
  const finished = useRef(false);
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);
  const commit = (): void => {
    if (finished.current) return;
    finished.current = true;
    props.onCommit(value);
  };
  const cancel = (): void => {
    if (finished.current) return;
    finished.current = true;
    props.onCancel();
  };
  return (
    <input
      ref={ref}
      type="text"
      className="sb-rename"
      data-testid={TID.renameInput}
      aria-label="Name"
      maxLength={MAX_BOARD_NAME_LENGTH}
      spellCheck={false}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      }}
      onBlur={commit}
    />
  );
}

interface RowProps {
  rowKey: string;
  testId: string;
  kind: 'notebook' | 'section' | 'page';
  level: number;
  label: string;
  current?: boolean;
  expanded?: boolean;
  tabbable: boolean;
  renaming: boolean;
  menuOpen: boolean;
  addLabel?: string;
  onActivate: () => void;
  onFocusRow: () => void;
  onAdd?: () => void;
  onMore: (button: HTMLButtonElement) => void;
  onStartRename: () => void;
  onCommitRename: (value: string) => void;
  onCancelRename: () => void;
  children?: ReactNode;
}

function Row(p: RowProps) {
  const expandable = p.kind !== 'page';
  const caret = expandable ? (
    <span className="sb-caret" data-open={p.expanded ? 'true' : 'false'} aria-hidden="true">
      <Icon name="chevron" size={14} />
    </span>
  ) : null;
  const lead =
    p.kind === 'notebook' ? (
      <span className="sb-lead" aria-hidden="true">
        <Icon name="notebook" size={16} />
      </span>
    ) : p.kind === 'section' ? (
      <span className="sb-bar" aria-hidden="true" />
    ) : null;
  return (
    <li
      role="treeitem"
      aria-level={p.level}
      aria-expanded={expandable ? !!p.expanded : undefined}
      aria-selected={p.kind === 'page' ? !!p.current : undefined}
    >
      <div
        className={`sb-row sb-${p.kind}`}
        data-testid={p.testId}
        data-key={p.rowKey}
        data-current={p.current ? 'true' : undefined}
        data-expanded={expandable ? String(!!p.expanded) : undefined}
        data-menu-open={p.menuOpen ? 'true' : undefined}
      >
        {p.renaming ? (
          <div className="sb-main sb-editing">
            {caret}
            {lead}
            <RenameInput initial={p.label} onCommit={p.onCommitRename} onCancel={p.onCancelRename} />
          </div>
        ) : (
          <button
            type="button"
            className="sb-main"
            data-rowmain=""
            data-key={p.rowKey}
            tabIndex={p.tabbable ? 0 : -1}
            title={p.label}
            aria-current={p.current ? 'page' : undefined}
            onFocus={p.onFocusRow}
            onClick={p.onActivate}
            onDoubleClick={p.onStartRename}
          >
            {caret}
            {lead}
            <span className="sb-name">{p.label}</span>
          </button>
        )}
        {!p.renaming && (
          <span className="sb-actions">
            {p.onAdd && (
              <button
                type="button"
                className="sb-act"
                data-testid={tidRowAdd(p.rowKey)}
                aria-label={p.addLabel}
                title={p.addLabel}
                onClick={(e) => {
                  e.stopPropagation();
                  p.onAdd?.();
                }}
              >
                <Icon name="plus" size={15} />
              </button>
            )}
            <button
              type="button"
              className="sb-act"
              data-testid={tidRowMenu(p.rowKey)}
              aria-haspopup="menu"
              aria-expanded={p.menuOpen}
              aria-label={`More actions for ${p.label}`}
              title="More"
              onClick={(e) => {
                e.stopPropagation();
                p.onMore(e.currentTarget);
              }}
            >
              <Icon name="more" size={15} />
            </button>
          </span>
        )}
      </div>
      {p.children}
    </li>
  );
}

interface MenuState {
  key: string;
  x: number;
  y: number;
  onRename: () => void;
  onDelete: () => void;
}

export function Sidebar() {
  const open = useAppState((s) => s.sidebarOpen);
  const library = useAppState((s) => s.library);
  const currentId = useAppState((s) => s.board?.id ?? null);
  const currentName = useAppState((s) => s.board?.name ?? '');
  const currentNb = useAppState((s) => s.board?.notebook ?? '');
  const currentSec = useAppState((s) => s.board?.section ?? '');

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(readSidebarPrefs().expanded));
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const confirmRef = useRef<string | null>(null); // mirrors confirmKey so menu handlers captured earlier see the live value
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setConfirm = (k: string | null): void => {
    confirmRef.current = k;
    setConfirmKey(k);
  };
  const treeRef = useRef<HTMLUListElement>(null);

  // The layout offset every floating island and the stage read.
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', open ? `${SIDEBAR_WIDTH_PX}px` : '0px');
  }, [open]);

  useEffect(() => {
    writeSidebarPrefs({ open, expanded: Array.from(expanded) });
  }, [open, expanded]);

  // Switching to a page reveals it (ancestors expand; the user can still collapse them afterwards).
  useEffect(() => {
    if (!currentNb) return;
    setExpanded((prev) => {
      const nk = nbKey(currentNb);
      const sk = secKey(currentNb, currentSec);
      if (prev.has(nk) && prev.has(sk)) return prev;
      const next = new Set(prev);
      next.add(nk);
      if (currentSec) next.add(sk);
      return next;
    });
  }, [currentId, currentNb, currentSec]);

  const load = useCallback(() => {
    setFailed(false);
    refreshLibrary().catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    if (library === null) load();
  }, [library, load]);
  useEffect(() => {
    if (library !== null) setFailed(false);
  }, [library]);

  // Menu: outside click and Escape close it; the delete confirmation never outlives the menu.
  useEffect(() => {
    if (!menu) return undefined;
    const onPointerDown = (e: PointerEvent): void => {
      const t = e.target;
      if (t instanceof Element && (t.closest('.sb-menu') || t.closest('.sb-act'))) return;
      setMenu(null);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setMenu(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [menu]);
  useEffect(() => {
    if (!menu) {
      setConfirm(null);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    }
  }, [menu]);
  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);

  const toggle = (key: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const reveal = (...keys: string[]): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => next.add(k));
      return next;
    });
  };

  const fail = (what: string) => (err: unknown): void => notify(`${what}: ${messageOf(err)}`, 'error');

  function openMenuFor(rowKey: string, button: HTMLButtonElement, onRename: () => void, onDelete: () => void): void {
    if (menu?.key === rowKey) {
      setMenu(null);
      return;
    }
    const r = button.getBoundingClientRect();
    setMenu({ key: rowKey, x: r.right, y: r.bottom + 4, onRename, onDelete });
  }

  function confirmThen(rowKey: string, run: () => Promise<void>, what: string): void {
    if (confirmRef.current !== rowKey) {
      setConfirm(rowKey);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => {
        if (confirmRef.current === rowKey) setConfirm(null);
      }, DELETE_CONFIRM_MS);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirm(null);
    setMenu(null);
    run().catch(fail(what));
  }

  function applyPlace(place: NewPlace | null, renameKey: (p: NewPlace) => string): void {
    if (!place) return;
    reveal(nbKey(place.notebook), secKey(place.notebook, place.section));
    setRenaming(renameKey(place));
  }

  // ---- rename commits -----------------------------------------------------
  function commitNotebook(nb: string, value: string): void {
    setRenaming(null);
    const name = value.trim();
    if (!name || name === nb) return;
    renameNotebook(nb, name)
      .then((final) => setExpanded((prev) => rekey(prev, nbKey(nb), nbKey(final))))
      .catch(fail('Could not rename notebook'));
  }
  function commitSection(nb: string, sec: string, value: string): void {
    setRenaming(null);
    const name = value.trim();
    if (!name || name === sec) return;
    renameSection(nb, sec, name)
      .then((final) => setExpanded((prev) => rekey(prev, secKey(nb, sec), secKey(nb, final))))
      .catch(fail('Could not rename section'));
  }
  function commitPage(id: string, current: string, value: string): void {
    setRenaming(null);
    const name = value.trim();
    if (!name || name === current) return;
    renamePage(id, name).catch(fail('Could not rename page'));
  }

  // ---- keyboard navigation ------------------------------------------------
  function onTreeKeyDown(e: ReactKeyboardEvent<HTMLUListElement>): void {
    const target = e.target;
    if (!(target instanceof HTMLElement) || !target.hasAttribute('data-rowmain')) return;
    const key = target.dataset.key ?? '';
    const rows = Array.from(treeRef.current?.querySelectorAll<HTMLElement>('[data-rowmain]') ?? []);
    const i = rows.indexOf(target);
    const go = (n: number): void => {
      e.preventDefault();
      rows[Math.max(0, Math.min(rows.length - 1, n))]?.focus();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(rows.length - 1);
    else if (e.key === 'ArrowRight' && !key.startsWith('page:') && !expanded.has(key)) {
      e.preventDefault();
      toggle(key);
    } else if (e.key === 'ArrowLeft' && !key.startsWith('page:') && expanded.has(key)) {
      e.preventDefault();
      toggle(key);
    } else if (e.key === 'F2') {
      e.preventDefault();
      setRenaming(key);
    }
  }

  const visibleKeys = useMemo(() => {
    const keys: string[] = [];
    for (const nb of library?.notebooks ?? []) {
      keys.push(nbKey(nb.name));
      if (!expanded.has(nbKey(nb.name))) continue;
      for (const sec of nb.sections) {
        keys.push(secKey(nb.name, sec.name));
        if (!expanded.has(secKey(nb.name, sec.name))) continue;
        for (const p of sec.pages) keys.push(pageKey(p.id));
      }
    }
    return keys;
  }, [library, expanded]);
  const preferred = focusKey ?? (currentId ? pageKey(currentId) : null);
  const tabKey = preferred && visibleKeys.includes(preferred) ? preferred : visibleKeys[0] ?? null;

  function renderTree(tree: LibraryTree) {
    return tree.notebooks.map((nb) => {
      const nk = nbKey(nb.name);
      const nbOpen = expanded.has(nk);
      return (
        <Row
          key={nk}
          rowKey={nk}
          testId={tidNotebook(nb.name)}
          kind="notebook"
          level={1}
          label={nb.name}
          expanded={nbOpen}
          tabbable={tabKey === nk}
          renaming={renaming === nk}
          menuOpen={menu?.key === nk}
          addLabel="New section"
          onActivate={() => toggle(nk)}
          onFocusRow={() => setFocusKey(nk)}
          onAdd={() => addSection(nb.name).then((pl) => applyPlace(pl, (x) => secKey(x.notebook, x.section))).catch(fail('Could not add section'))}
          onMore={(b) => openMenuFor(nk, b, () => setRenaming(nk), () => confirmThen(nk, () => deleteNotebook(nb.name), 'Could not delete notebook'))}
          onStartRename={() => setRenaming(nk)}
          onCommitRename={(v) => commitNotebook(nb.name, v)}
          onCancelRename={() => setRenaming(null)}
        >
          {nbOpen && (
            <ul role="group" className="sb-group">
              {nb.sections.map((sec) => {
                const sk = secKey(nb.name, sec.name);
                const secOpen = expanded.has(sk);
                return (
                  <Row
                    key={sk}
                    rowKey={sk}
                    testId={tidSection(nb.name, sec.name)}
                    kind="section"
                    level={2}
                    label={sec.name}
                    expanded={secOpen}
                    tabbable={tabKey === sk}
                    renaming={renaming === sk}
                    menuOpen={menu?.key === sk}
                    addLabel="New page"
                    onActivate={() => toggle(sk)}
                    onFocusRow={() => setFocusKey(sk)}
                    onAdd={() => addPage(nb.name, sec.name).then((pl) => applyPlace(pl, (x) => pageKey(x.id))).catch(fail('Could not add page'))}
                    onMore={(b) => openMenuFor(sk, b, () => setRenaming(sk), () => confirmThen(sk, () => deleteSection(nb.name, sec.name), 'Could not delete section'))}
                    onStartRename={() => setRenaming(sk)}
                    onCommitRename={(v) => commitSection(nb.name, sec.name, v)}
                    onCancelRename={() => setRenaming(null)}
                  >
                    {secOpen && (
                      <ul role="group" className="sb-group">
                        {sec.pages.map((page) => {
                          const pk = pageKey(page.id);
                          const isCurrent = page.id === currentId;
                          const label = isCurrent && currentName ? currentName : page.name;
                          return (
                            <Row
                              key={pk}
                              rowKey={pk}
                              testId={tidPage(page.id)}
                              kind="page"
                              level={3}
                              label={label}
                              current={isCurrent}
                              tabbable={tabKey === pk}
                              renaming={renaming === pk}
                              menuOpen={menu?.key === pk}
                              onActivate={() => {
                                if (!isCurrent) openBoard(page.id).catch(fail('Could not open page'));
                              }}
                              onFocusRow={() => setFocusKey(pk)}
                              onMore={(b) => openMenuFor(pk, b, () => setRenaming(pk), () => confirmThen(pk, () => deletePage(page.id), 'Could not delete page'))}
                              onStartRename={() => setRenaming(pk)}
                              onCommitRename={(v) => commitPage(page.id, label, v)}
                              onCancelRename={() => setRenaming(null)}
                            />
                          );
                        })}
                      </ul>
                    )}
                  </Row>
                );
              })}
            </ul>
          )}
        </Row>
      );
    });
  }

  return (
    <aside
      className="sidebar"
      data-testid={TID.sidebar}
      data-open={open ? 'true' : 'false'}
      aria-label="Notebooks"
      aria-hidden={!open}
      inert={!open}
    >
      <div className="sb-header">
        <span className="sb-brand">Chalk</span>
        <button
          type="button"
          className="icon-btn sb-collapse"
          data-testid={TID.sidebarCollapse}
          aria-label="Hide sidebar"
          title="Hide sidebar — Ctrl + \"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setSidebarOpen(false)}
        >
          <Icon name="sidebar" size={18} />
        </button>
      </div>
      <div className="sb-scroll">
        {library === null && !failed && <div className="sb-note">Loading…</div>}
        {library === null && failed && (
          <div className="sb-note" role="alert">
            <div>Could not reach the library</div>
            <button type="button" className="text-btn" data-testid={TID.sidebarRetry} onClick={load}>
              Retry
            </button>
          </div>
        )}
        {library !== null && library.notebooks.length === 0 && <div className="sb-note">No notebooks yet. Create one below.</div>}
        {library !== null && library.notebooks.length > 0 && (
          <ul role="tree" aria-label="Notebooks, sections and pages" className="sb-tree" ref={treeRef} onKeyDown={onTreeKeyDown}>
            {renderTree(library)}
          </ul>
        )}
      </div>
      <div className="sb-footer">
        <button
          type="button"
          className="sb-new"
          data-testid={TID.sidebarNewNotebook}
          onClick={() => {
            addNotebook().then((pl) => applyPlace(pl, (x) => nbKey(x.notebook))).catch(fail('Could not create notebook'));
          }}
        >
          <Icon name="plus" size={16} />
          New notebook
        </button>
        <div className="sb-path" data-testid={TID.sidebarPath} title={library?.path ?? ''}>
          {library?.path ?? ''}
        </div>
      </div>
      {menu && (
        <div className="sb-menu" role="menu" style={{ left: Math.max(8, menu.x - 148), top: menu.y }}>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            data-testid={tidRowRename(menu.key)}
            onClick={() => {
              const act = menu.onRename;
              setMenu(null);
              act();
            }}
          >
            <Icon name="pencil" size={15} />
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className={`menu-item danger${confirmKey === menu.key ? ' confirm' : ''}`}
            data-testid={tidRowDelete(menu.key)}
            onClick={() => menu.onDelete()}
          >
            <Icon name="trash" size={15} />
            {confirmKey === menu.key ? 'Confirm' : 'Delete'}
          </button>
        </div>
      )}
    </aside>
  );
}
