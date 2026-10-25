// Debounced, single-flight autosave with optimistic versioning, backoff, conflict detection and an unload flush (WP5).
import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_MAX_WAIT_MS,
  AUTOSAVE_RETRY_BASE_MS,
  AUTOSAVE_RETRY_MAX_MS,
  KEEPALIVE_MAX_BYTES,
} from '../constants';
import { toSceneFile } from '../core/serialize';
import { getState, notify, setState, subscribe } from '../state/store';
import type { ChalkElement, SceneFile } from '../types';
import { api, ApiError } from './api';
import { clearBackup, writeBackup } from './backup';

type Timer = ReturnType<typeof setTimeout>;

interface SaveOptions {
  keepalive?: boolean;
  force?: boolean;
}

let lastSaved: { elements: readonly ChalkElement[]; name: string } = { elements: [], name: '' };
let timer: Timer | null = null;
let retryTimer: Timer | null = null;
let firstDirtyAt = 0;
let inFlight: Promise<void> | null = null;
let queued = false;
let retryDelay = 0;
let detachCurrent: (() => void) | null = null;

function clearTimers(): void {
  if (timer !== null) clearTimeout(timer);
  if (retryTimer !== null) clearTimeout(retryTimer);
  timer = null;
  retryTimer = null;
}

/** True when the loaded board has changes (elements or name) the server has not acknowledged. */
export function isDirty(): boolean {
  const { board, elements } = getState();
  return board !== null && (elements !== lastSaved.elements || board.name !== lastSaved.name);
}

/** Records the given (default: current) elements and name as saved, and cancels pending saves. Does not touch saveStatus. */
export function markClean(elements?: readonly ChalkElement[], name?: string): void {
  const s = getState();
  lastSaved = { elements: elements ?? s.elements, name: name ?? s.board?.name ?? '' };
  clearTimers();
  firstDirtyAt = 0;
  retryDelay = 0;
  queued = false;
}

function schedule(): void {
  if (firstDirtyAt === 0) firstDirtyAt = Date.now();
  if (timer !== null) clearTimeout(timer);
  const delay = Math.min(AUTOSAVE_DEBOUNCE_MS, Math.max(0, firstDirtyAt + AUTOSAVE_MAX_WAIT_MS - Date.now()));
  timer = setTimeout(() => {
    timer = null;
    void save();
  }, delay);
}

function currentBoardId(): string | null {
  return getState().board?.id ?? null;
}

/** Handles a save the server accepted (or already holds): adopt `version` and mark what was sent as clean. */
function onSaved(boardId: string, elements: readonly ChalkElement[], name: string, version: number): void {
  if (currentBoardId() !== boardId) return;
  lastSaved = { elements, name };
  retryDelay = 0;
  clearBackup(boardId);
  setState((s) => ({ board: s.board && { ...s.board, version } }));
  const dirty = isDirty();
  setState({ saveStatus: dirty ? 'dirty' : 'saved' });
  if (dirty) schedule();
}

async function run(boardId: string, elements: readonly ChalkElement[], name: string, version: number, o: SaveOptions): Promise<void> {
  try {
    const scene = toSceneFile(elements);
    const body = o.force ? { name, scene } : { name, scene, baseVersion: version };
    const resp = await api.updateBoard(boardId, body, { keepalive: o.keepalive });
    onSaved(boardId, elements, name, resp.version);
  } catch (e) {
    await onFailure(e, boardId, elements, name, version);
  }
}

async function onFailure(e: unknown, boardId: string, elements: readonly ChalkElement[], name: string, version: number): Promise<void> {
  if (e instanceof ApiError && e.status === 409) {
    // A fast reload can race the keepalive PUT of the previous page: if the server already holds exactly this, adopt it.
    try {
      const fresh = await api.getBoard(boardId);
      if (fresh.name === name && JSON.stringify(fresh.scene.elements) === JSON.stringify(elements)) {
        onSaved(boardId, elements, name, fresh.version);
        return;
      }
    } catch {
      /* fall through to conflict */
    }
    if (currentBoardId() === boardId) setState({ saveStatus: 'conflict' });
    return;
  }
  let scene: SceneFile | undefined;
  try {
    scene = toSceneFile(elements);
  } catch {
    scene = undefined;
  }
  if (scene) writeBackup({ boardId, baseVersion: version, savedAt: new Date().toISOString(), name, scene });
  if (currentBoardId() !== boardId) return;
  if (e instanceof ApiError && e.status === 404) {
    setState({ saveStatus: 'error' });
    notify('This board no longer exists on the server', 'error');
    return;
  }
  setState({ saveStatus: 'error' });
  retryDelay = retryDelay ? Math.min(retryDelay * 2, AUTOSAVE_RETRY_MAX_MS) : AUTOSAVE_RETRY_BASE_MS;
  if (retryTimer !== null) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void save();
  }, retryDelay);
}

function save(o: SaveOptions = {}): Promise<void> {
  if (inFlight) {
    queued = true;
    return inFlight;
  }
  const s = getState();
  const board = s.board;
  if (!board) return Promise.resolve();
  if (s.saveStatus === 'conflict' && !o.force) return Promise.resolve();
  if (!o.force && !isDirty()) {
    if (s.saveStatus !== 'loading') setState({ saveStatus: 'saved' });
    return Promise.resolve();
  }
  clearTimers();
  firstDirtyAt = 0;
  const { elements } = s;
  setState({ saveStatus: 'saving' });
  const p: Promise<void> = run(board.id, elements, board.name, board.version, o).finally(() => {
    if (inFlight === p) inFlight = null;
    if (queued) {
      queued = false;
      schedule();
    }
  });
  inFlight = p;
  return p;
}

/** Saves now if dirty; resolves when nothing is dirty or in flight, rejects when the save ended in error or conflict. */
export async function flushSave(opts?: { keepalive?: boolean }): Promise<void> {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  while (inFlight || isDirty()) {
    await (inFlight ?? save(opts));
    const status = getState().saveStatus;
    if (status === 'error' || status === 'conflict') throw new Error('save failed: ' + status);
  }
}

/** "Keep mine": PUT without baseVersion. On success the status becomes 'saved', which un-pauses autosave. */
export async function forceSave(): Promise<void> {
  await save({ force: true });
}

function leavePage(): void {
  try {
    if (!isDirty()) return;
    const { board, elements } = getState();
    if (!board) return;
    const scene = toSceneFile(elements);
    writeBackup({ boardId: board.id, baseVersion: board.version, savedAt: new Date().toISOString(), name: board.name, scene });
    if (JSON.stringify(scene).length < KEEPALIVE_MAX_BYTES) flushSave({ keepalive: true }).catch(() => undefined);
  } catch {
    /* never throw while the page is closing */
  }
}

/** Subscribes to the store and to page-leave events. Calling it again first detaches the previous instance. */
export function startAutosave(): () => void {
  if (detachCurrent) detachCurrent();

  const unsubscribe = subscribe((s, prev) => {
    if (s.elements === prev.elements && s.board?.name === prev.board?.name) return;
    if (!s.board || s.saveStatus === 'conflict' || s.saveStatus === 'loading') return;
    if (!isDirty()) {
      if (s.saveStatus === 'dirty') setState({ saveStatus: 'saved' });
      return;
    }
    if (s.saveStatus !== 'saving') setState({ saveStatus: 'dirty' });
    schedule();
  });

  const onVisibility = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') leavePage();
  };
  let listening = false;
  try {
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', leavePage);
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
      listening = true;
    }
  } catch {
    /* no DOM */
  }

  let active = true;
  const detach = (): void => {
    if (!active) return;
    active = false;
    unsubscribe();
    if (listening) {
      try {
        window.removeEventListener('pagehide', leavePage);
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
      } catch {
        /* ignore */
      }
    }
    if (detachCurrent === detach) detachCurrent = null;
  };
  detachCurrent = detach;
  return detach;
}

/** Tests only: forget everything (timers, in-flight bookkeeping, listeners). */
export function resetAutosaveForTests(): void {
  if (detachCurrent) detachCurrent();
  clearTimers();
  lastSaved = { elements: [], name: '' };
  firstDirtyAt = 0;
  inFlight = null;
  queued = false;
  retryDelay = 0;
}
