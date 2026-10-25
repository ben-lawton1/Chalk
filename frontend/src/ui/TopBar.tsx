// Top bar: main menu, editable board name, save status pill and the conflict banner. Owner: WP4.
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { DEFAULT_BOARD_NAME, MAX_BOARD_NAME_LENGTH } from '../constants';
import { createBoard, renameBoard, resolveConflict } from '../persistence/boards';
import { exportPng, exportSceneJson, importSceneJson } from '../render/export';
import { openDialog, replaceScene } from '../state/actions';
import { getState, notify } from '../state/store';
import { TID } from '../testids';
import type { SaveStatus } from '../types';
import { useAppState } from './hooks';
import { Icon } from './icons';

const STATUS_TEXT: Record<SaveStatus, string> = {
  loading: 'Loading…',
  saved: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Offline — retrying',
  conflict: 'Conflict',
};

function currentBoardName(): string {
  return getState().board?.name ?? DEFAULT_BOARD_NAME;
}

export function TopBar() {
  const boardName = useAppState((s) => s.board?.name ?? '');
  const hasBoard = useAppState((s) => s.board !== null);
  const saveStatus = useAppState((s) => s.saveStatus);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState(boardName);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const skipBlurCommit = useRef(false);

  useEffect(() => { setDraft(boardName); }, [boardName]);

  // Menu: click outside closes it; Escape closes it before the global Escape handling runs.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (wrapRef.current && e.target instanceof Node && wrapRef.current.contains(e.target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [menuOpen]);

  function run(fn: () => void): void {
    setMenuOpen(false);
    try {
      fn();
    } catch (err) {
      console.error(err);
    }
  }

  function onImportChange(e: ChangeEvent<HTMLInputElement>): void {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    importSceneJson(file)
      .then((els) => replaceScene(els))
      .catch((err: unknown) => notify('Could not import: ' + (err instanceof Error ? err.message : String(err)), 'error'))
      .finally(() => { input.value = ''; });
  }

  function commitName(): void {
    renameBoard(draft);
    const next = draft.trim().slice(0, MAX_BOARD_NAME_LENGTH);
    setDraft(next === '' ? boardName : next);
  }
  function onNameKeyDown(e: ReactKeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitName();
      skipBlurCommit.current = true;
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setDraft(boardName);
      skipBlurCommit.current = true;
      e.currentTarget.blur();
    }
  }
  function onNameBlur(): void {
    if (skipBlurCommit.current) {
      skipBlurCommit.current = false;
      return;
    }
    commitName();
  }

  return (
    <>
      <div className="island topbar">
        <div className="menu-wrap" ref={wrapRef}>
          <button
            type="button"
            className="icon-btn"
            data-testid={TID.menuButton}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Main menu"
            title="Menu"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Icon name="menu" size={20} />
          </button>
          {menuOpen && (
            <div className="menu-dropdown" role="menu">
              <button type="button" role="menuitem" className="menu-item" data-testid={TID.menuNewBoard}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(() => { void createBoard(); })}>
                New board
              </button>
              <button type="button" role="menuitem" className="menu-item" data-testid={TID.menuOpenBoards}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(() => openDialog('boards'))}>
                Open board…
              </button>
              <div className="menu-sep" role="separator" />
              <button type="button" role="menuitem" className="menu-item" data-testid={TID.menuImport}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(() => fileRef.current?.click())}>
                Import scene…
              </button>
              <button type="button" role="menuitem" className="menu-item" data-testid={TID.menuExportJson}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(() => exportSceneJson(getState().elements, currentBoardName()))}>
                Export as JSON
              </button>
              <button type="button" role="menuitem" className="menu-item" data-testid={TID.menuExportPng}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(() => {
                  exportPng(getState().elements, currentBoardName())
                    .then((ok) => { if (!ok) notify('Nothing to export'); })
                    .catch((err: unknown) => notify('Export failed: ' + (err instanceof Error ? err.message : String(err)), 'error'));
                })}>
                Export as PNG
              </button>
              <div className="menu-sep" role="separator" />
              <button type="button" role="menuitem" className="menu-item" data-testid={TID.menuHelp}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(() => openDialog('help'))}>
                Keyboard shortcuts
              </button>
            </div>
          )}
        </div>
        <input
          type="text"
          className="board-name"
          data-testid={TID.boardName}
          aria-label="Board name"
          title="Rename board"
          maxLength={MAX_BOARD_NAME_LENGTH}
          disabled={!hasBoard}
          spellCheck={false}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onNameKeyDown}
          onBlur={onNameBlur}
        />
        <span className="save-status" data-testid={TID.saveStatus} data-status={saveStatus} role="status">
          {STATUS_TEXT[saveStatus]}
        </span>
        <input
          ref={fileRef}
          type="file"
          hidden
          data-testid={TID.importFileInput}
          accept=".json,.chalk.json,application/json"
          onChange={onImportChange}
        />
      </div>
      {saveStatus === 'conflict' && (
        <div className="island conflict-banner" data-testid={TID.conflictBanner} role="alert">
          <span>This board was changed somewhere else.</span>
          <button type="button" className="text-btn" data-testid={TID.conflictReload}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { void resolveConflict('reload'); }}>
            Reload
          </button>
          <button type="button" className="text-btn primary" data-testid={TID.conflictOverwrite}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { void resolveConflict('overwrite'); }}>
            Keep mine
          </button>
        </div>
      )}
    </>
  );
}
