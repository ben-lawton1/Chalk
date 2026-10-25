// Tests for board lifecycle: init, open, backup restore, create/delete, rename, conflict resolution (WP5).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOARD_LOAD_RETRIES,
  BOARD_LOAD_RETRY_MS,
  LOAD_FIT_MAX_ZOOM,
  MAX_BOARD_NAME_LENGTH,
  VIEWPORT_SAVE_DEBOUNCE_MS,
  VIEWPORT_STORAGE_PREFIX,
} from '../constants';
import { parseSceneFile, toSceneFile } from '../core/serialize';
import { zoomToFit } from '../state/actions';
import { clearHistory } from '../state/history';
import { getState, resetState, setState } from '../state/store';
import type { Board, BoardSummary, ChalkElement, SceneFile } from '../types';
import { api, ApiError } from './api';
import { clearBackup, readBackup } from './backup';
import type { BoardBackup } from './backup';
import { isDirty, resetAutosaveForTests } from './autosave';
import {
  createBoard,
  deleteBoard,
  initBoards,
  loadIntoState,
  openBoard,
  renameBoard,
  resolveConflict,
} from './boards';

vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  api: {
    health: vi.fn(),
    listBoards: vi.fn(),
    getBoard: vi.fn(),
    createBoard: vi.fn(),
    updateBoard: vi.fn(),
    deleteBoard: vi.fn(),
  },
}));
vi.mock('../core/serialize');
vi.mock('../state/actions');
vi.mock('./backup');

const el = (id: string): ChalkElement => ({ id }) as unknown as ChalkElement;
const scene: SceneFile = { type: 'chalk/scene', version: 1, elements: [] };
const board = (id: string, over: Partial<Board> = {}): Board => ({
  id, name: 'Board ' + id, version: 3, updatedAt: 'x', createdAt: 'x', scene, ...over,
});
const sum = (id: string): BoardSummary => ({ id, name: 'Board ' + id, version: 1, updatedAt: 'x' });

interface FakeWindow { replaceState: ReturnType<typeof vi.fn>; store: Record<string, string> }

function stubWindow(search = '', store: Record<string, string> = {}): FakeWindow {
  const replaceState = vi.fn();
  vi.stubGlobal('window', {
    location: { search },
    history: { replaceState },
    localStorage: {
      getItem: (k: string) => (k in store ? store[k]! : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    },
  });
  return { replaceState, store };
}

beforeEach(() => {
  resetAutosaveForTests();
  resetState();
  clearHistory();
  vi.mocked(parseSceneFile).mockReturnValue([]);
  vi.mocked(toSceneFile).mockImplementation((els) => ({ type: 'chalk/scene', version: 1, elements: [...els] }));
  vi.mocked(readBackup).mockReturnValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('initBoards', () => {
  it('opens the most recent board when there is no board param', async () => {
    vi.mocked(api.listBoards).mockResolvedValue([sum('first1'), sum('second')]);
    vi.mocked(api.getBoard).mockResolvedValue(board('first1'));
    await initBoards();
    expect(api.getBoard).toHaveBeenCalledWith('first1');
    expect(api.createBoard).not.toHaveBeenCalled();
    expect(getState().board).toEqual({ id: 'first1', name: 'Board first1', version: 3 });
    expect(getState().saveStatus).toBe('saved');
    expect(zoomToFit).toHaveBeenCalledWith({ maxZoom: LOAD_FIT_MAX_ZOOM });
  });

  it('creates a default board when there are none', async () => {
    vi.mocked(api.listBoards).mockResolvedValue([]);
    vi.mocked(api.createBoard).mockResolvedValue(board('newone', { name: 'Untitled board', version: 1 }));
    await initBoards();
    expect(api.createBoard).toHaveBeenCalledWith({ name: 'Untitled board' });
    expect(getState().board?.id).toBe('newone');
  });

  it('opens the board named by ?board= and keeps the URL', async () => {
    const w = stubWindow('?board=abc123');
    vi.mocked(api.getBoard).mockResolvedValue(board('abc123'));
    await initBoards();
    expect(api.listBoards).not.toHaveBeenCalled();
    expect(getState().board?.id).toBe('abc123');
    expect(w.replaceState).toHaveBeenCalledWith(null, '', '?board=abc123');
  });

  it('a missing ?board= creates a new board and says so', async () => {
    const w = stubWindow('?board=gone123');
    vi.mocked(api.getBoard).mockRejectedValue(new ApiError(404, { detail: 'Board not found' }));
    vi.mocked(api.createBoard).mockResolvedValue(board('fresh1', { version: 1 }));
    await initBoards();
    expect(getState().toast?.message).toBe('Board not found — created a new one');
    expect(api.createBoard).toHaveBeenCalledWith({});
    expect(getState().board?.id).toBe('fresh1');
    expect(w.replaceState).toHaveBeenLastCalledWith(null, '', '?board=fresh1');
  });

  it('retries a network failure, then gives up with an error toast', async () => {
    vi.useFakeTimers();
    vi.mocked(api.listBoards).mockRejectedValue(new TypeError('offline'));
    const p = initBoards();
    await vi.advanceTimersByTimeAsync(BOARD_LOAD_RETRY_MS * (BOARD_LOAD_RETRIES + 1));
    await p;
    expect(api.listBoards).toHaveBeenCalledTimes(BOARD_LOAD_RETRIES + 1);
    expect(getState().toast).toMatchObject({ message: 'Cannot reach the Chalk server', kind: 'error' });
    expect(getState().saveStatus).toBe('error');
    expect(getState().board).toBeNull();
  });

  it('succeeds when the server comes up during the retries', async () => {
    vi.useFakeTimers();
    vi.mocked(api.listBoards).mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue([sum('late01')]);
    vi.mocked(api.getBoard).mockResolvedValue(board('late01'));
    const p = initBoards();
    await vi.advanceTimersByTimeAsync(BOARD_LOAD_RETRY_MS);
    await p;
    expect(getState().board?.id).toBe('late01');
    expect(getState().toast).toBeNull();
  });
});

describe('openBoard and backups', () => {
  const backupFor = (baseVersion: number): BoardBackup => ({
    boardId: 'b1', baseVersion, savedAt: 'x', name: 'Board b1',
    scene: { type: 'chalk/scene', version: 1, elements: [el('mine')] },
  });

  it('restores a backup whose baseVersion matches and autosave sees it as dirty', async () => {
    const backup = backupFor(3);
    vi.mocked(readBackup).mockReturnValue(backup);
    vi.mocked(api.getBoard).mockResolvedValue(board('b1', { version: 3 }));
    vi.mocked(parseSceneFile).mockImplementation((input) => (input === backup.scene ? [el('mine')] : []));
    await openBoard('b1', { skipFlush: true });
    expect(getState().elements.map((e) => e.id)).toEqual(['mine']);
    expect(getState().toast?.message).toBe('Restored unsaved changes from this browser');
    expect(getState().board?.version).toBe(3);
    expect(isDirty()).toBe(true);
    expect(clearBackup).not.toHaveBeenCalled();
  });

  it('discards a stale backup', async () => {
    vi.mocked(readBackup).mockReturnValue(backupFor(2));
    vi.mocked(api.getBoard).mockResolvedValue(board('b1', { version: 3 }));
    await openBoard('b1', { skipFlush: true });
    expect(clearBackup).toHaveBeenCalledWith('b1');
    expect(getState().elements).toEqual([]);
    expect(getState().toast).toBeNull();
    expect(isDirty()).toBe(false);
  });

  it('discards a backup that cannot be parsed', async () => {
    const backup = backupFor(3);
    vi.mocked(readBackup).mockReturnValue(backup);
    vi.mocked(api.getBoard).mockResolvedValue(board('b1', { version: 3 }));
    vi.mocked(parseSceneFile).mockImplementation((input) => {
      if (input === backup.scene) throw new Error('bad');
      return [];
    });
    await openBoard('b1', { skipFlush: true });
    expect(clearBackup).toHaveBeenCalledWith('b1');
    expect(getState().board?.id).toBe('b1');
  });

  it('loadIntoState resets selection, editing, dialog and history', () => {
    resetState({ selectedIds: ['x'], dialog: 'boards', canUndo: true });
    loadIntoState(board('b9'));
    expect(getState().selectedIds).toEqual([]);
    expect(getState().dialog).toBe('none');
    expect(getState().editing).toBeNull();
    expect(getState().canUndo).toBe(false);
    expect(getState().interaction.hoverId).toBeNull();
  });

  it('uses the remembered viewport instead of fitting', () => {
    stubWindow('', { [VIEWPORT_STORAGE_PREFIX + 'b9']: JSON.stringify({ scrollX: 10, scrollY: -20, zoom: 2 }) });
    loadIntoState(board('b9'));
    expect(getState().viewport).toEqual({ scrollX: 10, scrollY: -20, zoom: 2 });
    expect(zoomToFit).not.toHaveBeenCalled();
  });

  it.each([
    ['not json', '{nope'],
    ['out of range zoom', JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 99 })],
    ['missing field', JSON.stringify({ scrollX: 0, zoom: 1 })],
    ['non-finite', JSON.stringify({ scrollX: null, scrollY: 0, zoom: 1 })],
  ])('falls back to zoomToFit for a bad remembered viewport (%s)', (_name, raw) => {
    stubWindow('', { [VIEWPORT_STORAGE_PREFIX + 'b9']: raw });
    loadIntoState(board('b9'));
    expect(zoomToFit).toHaveBeenCalledWith({ maxZoom: LOAD_FIT_MAX_ZOOM });
  });

  it('a failed open keeps the previous status and rethrows', async () => {
    resetState({ board: { id: 'cur', name: 'Cur', version: 1 }, saveStatus: 'saved' });
    vi.mocked(api.getBoard).mockRejectedValue(new TypeError('offline'));
    await expect(openBoard('b1', { skipFlush: true })).rejects.toThrow('offline');
    expect(getState().saveStatus).toBe('saved');
    expect(getState().board?.id).toBe('cur');
  });

  it('flushes the current board first and aborts when that fails', async () => {
    const mine = [el('unsaved')];
    resetState({ board: { id: 'cur', name: 'Cur', version: 1 }, saveStatus: 'dirty', elements: mine });
    vi.mocked(api.updateBoard).mockRejectedValue(new TypeError('offline'));
    await openBoard('b1');
    expect(api.getBoard).not.toHaveBeenCalled();
    expect(getState().toast).toMatchObject({ message: 'Could not save the current board', kind: 'error' });
    expect(getState().board?.id).toBe('cur');
  });
});

describe('viewport memory', () => {
  it('writes the viewport for the loaded board after the debounce', async () => {
    vi.useFakeTimers();
    const w = stubWindow('');
    vi.mocked(api.listBoards).mockResolvedValue([sum('vp0001')]);
    vi.mocked(api.getBoard).mockResolvedValue(board('vp0001'));
    await initBoards();
    await vi.advanceTimersByTimeAsync(VIEWPORT_SAVE_DEBOUNCE_MS);
    for (const k of Object.keys(w.store)) delete w.store[k];
    setState({ viewport: { scrollX: 5, scrollY: 6, zoom: 1.5 } });
    expect(w.store[VIEWPORT_STORAGE_PREFIX + 'vp0001']).toBeUndefined();
    await vi.advanceTimersByTimeAsync(VIEWPORT_SAVE_DEBOUNCE_MS);
    expect(JSON.parse(w.store[VIEWPORT_STORAGE_PREFIX + 'vp0001']!)).toEqual({ scrollX: 5, scrollY: 6, zoom: 1.5 });
  });
});

describe('createBoard and deleteBoard', () => {
  it('createBoard sends the name and loads the new board', async () => {
    vi.mocked(api.createBoard).mockResolvedValue(board('made01', { name: 'Plan', version: 1 }));
    await createBoard('Plan');
    expect(api.createBoard).toHaveBeenCalledWith({ name: 'Plan' });
    expect(getState().board).toEqual({ id: 'made01', name: 'Plan', version: 1 });
  });

  it('createBoard without a name sends an empty body', async () => {
    vi.mocked(api.createBoard).mockResolvedValue(board('made02', { version: 1 }));
    await createBoard();
    expect(api.createBoard).toHaveBeenCalledWith({});
  });

  it('createBoard does not create when the current board cannot be saved', async () => {
    resetState({ board: { id: 'cur', name: 'Cur', version: 1 }, saveStatus: 'dirty', elements: [el('u')] });
    vi.mocked(api.updateBoard).mockRejectedValue(new TypeError('offline'));
    await createBoard('Other');
    expect(api.createBoard).not.toHaveBeenCalled();
    expect(getState().toast?.kind).toBe('error');
  });

  it('deleting a non-current board only cleans up', async () => {
    resetState({ board: { id: 'cur', name: 'Cur', version: 1 }, saveStatus: 'saved' });
    vi.mocked(api.deleteBoard).mockResolvedValue(undefined);
    await deleteBoard('other1');
    expect(api.deleteBoard).toHaveBeenCalledWith('other1');
    expect(clearBackup).toHaveBeenCalledWith('other1');
    expect(getState().board?.id).toBe('cur');
    expect(api.listBoards).not.toHaveBeenCalled();
  });

  it('deleting the current board opens the first remaining one', async () => {
    resetState({ board: { id: 'cur', name: 'Cur', version: 1 }, saveStatus: 'saved' });
    vi.mocked(api.deleteBoard).mockResolvedValue(undefined);
    vi.mocked(api.listBoards).mockResolvedValue([sum('next01')]);
    vi.mocked(api.getBoard).mockResolvedValue(board('next01'));
    await deleteBoard('cur');
    expect(getState().board?.id).toBe('next01');
  });

  it('deleting the last board creates a fresh one', async () => {
    resetState({ board: { id: 'cur', name: 'Cur', version: 1 }, saveStatus: 'saved' });
    vi.mocked(api.deleteBoard).mockResolvedValue(undefined);
    vi.mocked(api.listBoards).mockResolvedValue([]);
    vi.mocked(api.createBoard).mockResolvedValue(board('fresh2', { version: 1 }));
    await deleteBoard('cur');
    expect(api.createBoard).toHaveBeenCalledWith({});
    expect(getState().board?.id).toBe('fresh2');
  });

  it('a 404 on delete counts as already deleted', async () => {
    resetState({ board: { id: 'cur', name: 'Cur', version: 1 }, saveStatus: 'saved' });
    vi.mocked(api.deleteBoard).mockRejectedValue(new ApiError(404, { detail: 'Board not found' }));
    await deleteBoard('other1');
    expect(clearBackup).toHaveBeenCalledWith('other1');
  });
});

describe('renameBoard', () => {
  beforeEach(() => resetState({ board: { id: 'b1', name: 'Old', version: 1 }, saveStatus: 'saved' }));

  it('trims and applies the new name', () => {
    renameBoard('  New name  ');
    expect(getState().board).toEqual({ id: 'b1', name: 'New name', version: 1 });
  });

  it('ignores blank and unchanged names', () => {
    const before = getState().board;
    renameBoard('   ');
    renameBoard('Old');
    renameBoard(' Old ');
    expect(getState().board).toBe(before);
  });

  it('truncates to the maximum length', () => {
    renameBoard('x'.repeat(MAX_BOARD_NAME_LENGTH + 30));
    expect(getState().board?.name).toHaveLength(MAX_BOARD_NAME_LENGTH);
  });

  it('does nothing without a board', () => {
    resetState();
    renameBoard('Anything');
    expect(getState().board).toBeNull();
  });
});

describe('resolveConflict', () => {
  beforeEach(() => resetState({ board: { id: 'b1', name: 'Mine', version: 1 }, saveStatus: 'conflict', elements: [el('mine')] }));

  it('reload discards local changes and loads the server copy', async () => {
    vi.mocked(api.getBoard).mockResolvedValue(board('b1', { name: 'Theirs', version: 9 }));
    await resolveConflict('reload');
    expect(clearBackup).toHaveBeenCalledWith('b1');
    expect(getState().board).toEqual({ id: 'b1', name: 'Theirs', version: 9 });
    expect(getState().elements).toEqual([]);
    expect(getState().saveStatus).toBe('saved');
  });

  it('overwrite saves without a baseVersion', async () => {
    vi.mocked(api.updateBoard).mockResolvedValue({ id: 'b1', name: 'Mine', version: 10, updatedAt: 'x' });
    await resolveConflict('overwrite');
    const body = vi.mocked(api.updateBoard).mock.calls[0]![1];
    expect('baseVersion' in body).toBe(false);
    expect(getState().saveStatus).toBe('saved');
    expect(getState().board?.version).toBe(10);
  });
});
