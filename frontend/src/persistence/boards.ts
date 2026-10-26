// Board lifecycle: init from the URL, open, create, delete, rename, conflict resolution and per-board viewport memory (WP5).
import {
  BOARD_LOAD_RETRIES,
  BOARD_LOAD_RETRY_MS,
  DEFAULT_BOARD_NAME,
  MAX_BOARD_NAME_LENGTH,
  MAX_ZOOM,
  MIN_ZOOM,
  SCENE_FILE_VERSION,
  VIEWPORT_SAVE_DEBOUNCE_MS,
  VIEWPORT_STORAGE_PREFIX,
} from '../constants';
import { parseSceneFile, parseSceneNotes } from '../core/serialize';
import { clearHistory } from '../state/history';
import { getState, notify, setInteraction, setState, setViewport, subscribe } from '../state/store';
import type { Board, BoardSummary, ChalkElement, NotesDoc, Viewport } from '../types';
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
  let restoredNotes: NotesDoc | null = null;
  if (backup) {
    if (backup.baseVersion === board.version) {
      try {
        restored = parseSceneFile(backup.scene);
        restoredNotes = parseSceneNotes(backup.scene) ?? null;
      } catch {
        restored = null;
      }
    }
    if (!restored) clearBackup(id);
  }
  if (restored) {
    loadIntoState(board, { elements: restored, notes: restoredNotes });
    notify('Restored unsaved changes from this browser');
  } else {
    loadIntoState(board);
  }
  replaceUrl(id);
}

export function loadIntoState(board: Board, opts?: { elements?: ChalkElement[]; notes?: NotesDoc | null }): void {
  let serverEls: ChalkElement[];
  let serverNotes: NotesDoc | null = null;
  try {
    serverEls = parseSceneFile(board.scene);
    serverNotes = parseSceneNotes(board.scene) ?? null;
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Could not read this board', 'error');
    serverEls = [];
  }
  const notes = opts?.notes !== undefined ? opts.notes : serverNotes;
  const els = opts?.elements ?? serverEls;
  // A migrated (older-version) file is "unsaved" on purpose: a fresh array identity makes autosave write the v2 file back once.
  const migrated = (board.scene.version as number) < SCENE_FILE_VERSION;
  markClean(migrated && !opts?.elements ? [...serverEls] : serverEls, board.name, serverNotes);
  setState({
    board: { id: board.id, name: board.name, version: board.version, notebook: board.notebook ?? '', section: board.section ?? '' },
    elements: els,
    notes,
    notesActive: false,
    notesBounds: null,
    selectedIds: [],
    editing: null,
    saveStatus: 'saved',
    dialog: 'none',
  });
  clearHistory();
  const remembered = readViewport(board.id);
  setViewport(remembered ?? { scrollX: 0, scrollY: 0, zoom: 1 }); // no memory: 100% at the home corner
  setInteraction({ hoverId: null, bindTarget: null });
}

/** Creates a page and opens it. The location defaults to the current page's notebook and section. */
export async function createBoard(name?: string, location?: { notebook: string; section: string }): Promise<void> {
  if (getState().board) {
    try {
      await flushSave();
    } catch {
      notify('Could not save the current board', 'error');
      return;
    }
  }
  const cur = getState().board;
  const where = location ?? (cur && cur.notebook && cur.section ? { notebook: cur.notebook, section: cur.section } : undefined);
  const board = await api.createBoard({ ...(name ? { name } : {}), ...(where ?? {}) });
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
  await openFirstOrCreate();
}

/** After the current page vanished (deleted with its section or notebook): open the most recent page, or start a new one. */
export async function openFirstOrCreate(): Promise<void> {
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
