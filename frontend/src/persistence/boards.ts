// Board lifecycle: init from the URL, open, create, delete, rename, conflict resolution and per-board viewport memory (WP5).
import {
  BOARD_LOAD_RETRIES,
  BOARD_LOAD_RETRY_MS,
  DEFAULT_BOARD_NAME,
  LOAD_FIT_MAX_ZOOM,
  MAX_BOARD_NAME_LENGTH,
  MAX_ZOOM,
  MIN_ZOOM,
  VIEWPORT_SAVE_DEBOUNCE_MS,
  VIEWPORT_STORAGE_PREFIX,
} from '../constants';
import { parseSceneFile } from '../core/serialize';
import { zoomToFit } from '../state/actions';
import { clearHistory } from '../state/history';
import { getState, notify, setInteraction, setState, setViewport, subscribe } from '../state/store';
import type { Board, BoardSummary, ChalkElement, Viewport } from '../types';
import { api, ApiError } from './api';
import { clearBackup, readBackup } from './backup';
import { flushSave, forceSave, markClean } from './autosave';

type Timer = ReturnType<typeof setTimeout>;

// ---------------------------------------------------------------------------
// Small guarded browser helpers
// ---------------------------------------------------------------------------

function getBoardParam(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('board') || null;
  } catch {
    return null;
  }
}

function replaceUrl(id: string): void {
  try {
    if (typeof window === 'undefined') return;
    window.history.replaceState(null, '', '?board=' + encodeURIComponent(id));
  } catch {
    /* ignore */
  }
}

function readViewport(id: string): Viewport | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(VIEWPORT_STORAGE_PREFIX + id);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Viewport> | null;
    if (!v || typeof v !== 'object') return null;
    const { scrollX, scrollY, zoom } = v;
    if (typeof scrollX !== 'number' || typeof scrollY !== 'number' || typeof zoom !== 'number') return null;
    if (!Number.isFinite(scrollX) || !Number.isFinite(scrollY) || !Number.isFinite(zoom)) return null;
    if (zoom < MIN_ZOOM || zoom > MAX_ZOOM) return null;
    return { scrollX, scrollY, zoom };
  } catch {
    return null;
  }
}

function writeViewport(id: string, v: Viewport): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(VIEWPORT_STORAGE_PREFIX + id, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

function removeViewport(id: string): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(VIEWPORT_STORAGE_PREFIX + id);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Viewport memory (one store subscription, installed by initBoards)
// ---------------------------------------------------------------------------

let viewportUnsub: (() => void) | null = null;
let viewportTimer: Timer | null = null;

function installViewportMemory(): void {
  if (viewportUnsub) return;
  viewportUnsub = subscribe((s, prev) => {
    if (s.viewport === prev.viewport || !s.board) return;
    const id = s.board.id; // captured now so a board switch cannot misfile it
    const viewport = s.viewport;
    if (viewportTimer !== null) clearTimeout(viewportTimer);
    viewportTimer = setTimeout(() => {
      viewportTimer = null;
      writeViewport(id, viewport);
    }, VIEWPORT_SAVE_DEBOUNCE_MS);
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function isRetryable(e: unknown): boolean {
  return !(e instanceof ApiError) || e.status >= 500;
}

async function initOnce(): Promise<void> {
  const id = getBoardParam();
  if (id) {
    try {
      await openBoard(id, { skipFlush: true });
      return;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
      notify('Board not found — created a new one');
      await createBoard();
      return;
    }
  }
  const list = await listBoards();
  const first = list[0];
  if (first) await openBoard(first.id, { skipFlush: true });
  else await createBoard(DEFAULT_BOARD_NAME);
}

export async function initBoards(): Promise<void> {
  installViewportMemory();
  for (let attempt = 0; ; attempt++) {
    try {
      await initOnce();
      return;
    } catch (e) {
      if (isRetryable(e) && attempt < BOARD_LOAD_RETRIES) {
        await new Promise<void>((resolve) => setTimeout(resolve, BOARD_LOAD_RETRY_MS));
        continue;
      }
      notify('Cannot reach the Chalk server', 'error');
      setState({ saveStatus: 'error' });
      return;
    }
  }
}

export async function openBoard(id: string, opts?: { skipFlush?: boolean }): Promise<void> {
  if (!opts?.skipFlush) {
    try {
      await flushSave();
    } catch {
      notify('Could not save the current board', 'error');
      return;
    }
  }
  const previousStatus = getState().saveStatus;
  setState({ saveStatus: 'loading' });
  let board: Board;
  try {
    board = await api.getBoard(id);
  } catch (e) {
    setState({ saveStatus: previousStatus }); // the current board (if any) stays usable
    throw e;
  }

  const backup = readBackup(id);
  let restored: ChalkElement[] | null = null;
  if (backup) {
    if (backup.baseVersion === board.version) {
      try {
        restored = parseSceneFile(backup.scene);
      } catch {
        restored = null;
      }
    }
    if (!restored) clearBackup(id);
  }
  if (restored) {
    loadIntoState(board, { elements: restored });
    notify('Restored unsaved changes from this browser');
  } else {
    loadIntoState(board);
  }
  replaceUrl(id);
}

export function loadIntoState(board: Board, opts?: { elements?: ChalkElement[] }): void {
  let serverEls: ChalkElement[];
  try {
    serverEls = parseSceneFile(board.scene);
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Could not read this board', 'error');
    serverEls = [];
  }
  const els = opts?.elements ?? serverEls;
  markClean(serverEls, board.name);
  setState({
    board: { id: board.id, name: board.name, version: board.version },
    elements: els,
    selectedIds: [],
    editing: null,
    saveStatus: 'saved',
    dialog: 'none',
  });
  clearHistory();
  const remembered = readViewport(board.id);
  if (remembered) setViewport(remembered);
  else zoomToFit({ maxZoom: LOAD_FIT_MAX_ZOOM });
  setInteraction({ hoverId: null, bindTarget: null });
}

export async function createBoard(name?: string): Promise<void> {
  if (getState().board) {
    try {
      await flushSave();
    } catch {
      notify('Could not save the current board', 'error');
      return;
    }
  }
  const board = await api.createBoard(name ? { name } : {});
  loadIntoState(board);
  replaceUrl(board.id);
}

export async function deleteBoard(id: string): Promise<void> {
  try {
    await api.deleteBoard(id);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) throw e; // already gone is fine
  }
  clearBackup(id);
  removeViewport(id);
  if (getState().board?.id !== id) return;
  setState({ board: null }); // autosave ignores a null board
  const list = await listBoards();
  const first = list[0];
  if (first) await openBoard(first.id, { skipFlush: true });
  else await createBoard();
}

export function listBoards(): Promise<BoardSummary[]> {
  return api.listBoards();
}

export function renameBoard(name: string): void {
  const board = getState().board;
  if (!board) return;
  const n = name.trim().slice(0, MAX_BOARD_NAME_LENGTH);
  if (!n || n === board.name) return;
  setState({ board: { ...board, name: n } });
}

export async function resolveConflict(choice: 'reload' | 'overwrite'): Promise<void> {
  const board = getState().board;
  if (!board) return;
  if (choice === 'reload') {
    clearBackup(board.id); // "reload" means: discard local changes
    await openBoard(board.id, { skipFlush: true });
  } else {
    await forceSave();
  }
}
