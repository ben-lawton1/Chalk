// Tests for debounced autosave, conflict handling, backoff and flush (WP5).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_MAX_WAIT_MS,
  AUTOSAVE_RETRY_BASE_MS,
  AUTOSAVE_RETRY_MAX_MS,
} from '../constants';
import { toSceneFile } from '../core/serialize';
import { clearHistory } from '../state/history';
import { getState, resetState, setState } from '../state/store';
import type { Board, BoardSummary, ChalkElement } from '../types';
import { api, ApiError } from './api';
import { clearBackup, writeBackup } from './backup';
import { flushSave, forceSave, isDirty, markClean, resetAutosaveForTests, startAutosave } from './autosave';

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
vi.mock('./backup');

const el = (id: string): ChalkElement => ({ id }) as unknown as ChalkElement;
const summary = (version: number): BoardSummary => ({ id: 'b1', name: 'N', version, updatedAt: 'x' });
const conflict = (): ApiError => new ApiError(409, { detail: { message: 'Version conflict', currentVersion: 9 } });

let detach: () => void;

/** Resolves a deferred promise by hand so tests can interleave saves. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(toSceneFile).mockImplementation((els) => ({ type: 'chalk/scene', version: 1, elements: [...els] }));
  resetAutosaveForTests();
  resetState({ board: { id: 'b1', name: 'N', version: 1 }, saveStatus: 'saved' });
  clearHistory();
  markClean();
  detach = startAutosave();
});

afterEach(() => {
  detach();
  resetAutosaveForTests();
  vi.useRealTimers();
});

describe('dirty tracking', () => {
  it('markClean makes the given elements and name the baseline', () => {
    const els = [el('a')];
    setState({ elements: els });
    expect(isDirty()).toBe(true);
    markClean();
    expect(isDirty()).toBe(false);
    markClean([el('zzz')], 'Other');
    expect(isDirty()).toBe(true);
  });

  it('is not dirty without a board', () => {
    setState({ board: null, elements: [el('a')] });
    expect(isDirty()).toBe(false);
  });

  it('a rename makes the board dirty', () => {
    setState((s) => ({ board: s.board && { ...s.board, name: 'Renamed' } }));
    expect(isDirty()).toBe(true);
    expect(getState().saveStatus).toBe('dirty');
  });

  it('reverting to the saved elements goes back to saved without a request', async () => {
    const saved = getState().elements;
    setState({ elements: [el('a')] });
    expect(getState().saveStatus).toBe('dirty');
    setState({ elements: saved });
    expect(getState().saveStatus).toBe('saved');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS * 2);
    expect(api.updateBoard).not.toHaveBeenCalled();
  });
});

describe('debounce and max wait', () => {
  it('coalesces rapid edits into one save sent after the debounce', async () => {
    vi.mocked(api.updateBoard).mockResolvedValue(summary(2));
    setState({ elements: [el('a')] });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 100);
    setState({ elements: [el('a'), el('b')] });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 100);
    expect(api.updateBoard).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(api.updateBoard).toHaveBeenCalledTimes(1);
    const [id, body, opts] = vi.mocked(api.updateBoard).mock.calls[0]!;
    expect(id).toBe('b1');
    expect(body.baseVersion).toBe(1);
    expect(body.name).toBe('N');
    expect(body.scene?.elements.map((e) => e.id)).toEqual(['a', 'b']);
    expect(opts?.keepalive).toBeFalsy();
  });

  it('saves after the max wait even while edits keep arriving', async () => {
    vi.mocked(api.updateBoard).mockResolvedValue(summary(2));
    let n = 0;
    const edit = (): void => setState({ elements: [el('e' + ++n)] });
    edit();
    let elapsed = 0;
    while (elapsed < AUTOSAVE_MAX_WAIT_MS - 500) {
      await vi.advanceTimersByTimeAsync(500);
      elapsed += 500;
      edit();
    }
    expect(api.updateBoard).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(api.updateBoard).toHaveBeenCalledTimes(1);
  });

  it('success adopts the version, clears the backup and goes to saved', async () => {
    vi.mocked(api.updateBoard).mockResolvedValue(summary(2));
    setState({ elements: [el('a')] });
    expect(getState().saveStatus).toBe('dirty');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(getState().saveStatus).toBe('saved');
    expect(getState().board?.version).toBe(2);
    expect(clearBackup).toHaveBeenCalledWith('b1');
    expect(isDirty()).toBe(false);
  });
});

describe('single flight', () => {
  it('queues a follow-up save for edits made while a save is in flight', async () => {
    const first = deferred<BoardSummary>();
    vi.mocked(api.updateBoard).mockReturnValueOnce(first.promise).mockResolvedValue(summary(3));
    setState({ elements: [el('a')] });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(api.updateBoard).toHaveBeenCalledTimes(1);
    expect(getState().saveStatus).toBe('saving');

    setState({ elements: [el('a'), el('b')] });
    expect(getState().saveStatus).toBe('saving');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS * 2);
    expect(api.updateBoard).toHaveBeenCalledTimes(1); // still single flight

    first.resolve(summary(2));
    await vi.advanceTimersByTimeAsync(0);
    expect(getState().board?.version).toBe(2);
    expect(getState().saveStatus).toBe('dirty');

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(api.updateBoard).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.updateBoard).mock.calls[1]![1].baseVersion).toBe(2);
    expect(getState().saveStatus).toBe('saved');
    expect(getState().board?.version).toBe(3);
  });

  it('ignores the result of a save for a board that is no longer loaded', async () => {
    const first = deferred<BoardSummary>();
    vi.mocked(api.updateBoard).mockReturnValueOnce(first.promise);
    setState({ elements: [el('a')] });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    const other = [el('x')];
    markClean(other, 'Other');
    setState({ board: { id: 'b2', name: 'Other', version: 5 }, elements: other, saveStatus: 'saved' });
    first.resolve(summary(2));
    await vi.advanceTimersByTimeAsync(0);
    expect(getState().board).toEqual({ id: 'b2', name: 'Other', version: 5 });
    expect(getState().saveStatus).toBe('saved');
    expect(isDirty()).toBe(false);
  });
});

describe('conflicts', () => {
  it('409 with different content pauses autosave in conflict', async () => {
    vi.mocked(api.updateBoard).mockRejectedValue(conflict());
    vi.mocked(api.getBoard).mockResolvedValue({
      id: 'b1', name: 'N', version: 9, updatedAt: 'x', createdAt: 'x',
      scene: { type: 'chalk/scene', version: 1, elements: [el('other')] },
    } as Board);
    setState({ elements: [el('a')] });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(getState().saveStatus).toBe('conflict');
    expect(getState().board?.version).toBe(1);

    // More edits do not schedule saves while in conflict.
    setState({ elements: [el('a'), el('b')] });
    expect(getState().saveStatus).toBe('conflict');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MAX_WAIT_MS * 2);
    expect(api.updateBoard).toHaveBeenCalledTimes(1);
  });

  it('409 where getBoard fails is a conflict', async () => {
    vi.mocked(api.updateBoard).mockRejectedValue(conflict());
    vi.mocked(api.getBoard).mockRejectedValue(new TypeError('offline'));
    setState({ elements: [el('a')] });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(getState().saveStatus).toBe('conflict');
  });

  it('409 whose fresh copy equals what we sent adopts that version', async () => {
    vi.mocked(api.updateBoard).mockRejectedValue(conflict());
    const sent = [el('a')];
    vi.mocked(api.getBoard).mockResolvedValue({
      id: 'b1', name: 'N', version: 9, updatedAt: 'x', createdAt: 'x',
      scene: { type: 'chalk/scene', version: 1, elements: [{ id: 'a' } as unknown as ChalkElement] },
    } as Board);
    setState({ elements: sent });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(api.getBoard).toHaveBeenCalledWith('b1');
    expect(getState().saveStatus).toBe('saved');
    expect(getState().board?.version).toBe(9);
    expect(clearBackup).toHaveBeenCalledWith('b1');
    expect(isDirty()).toBe(false);
  });

  it('409 with an equal scene but a different name is still a conflict', async () => {
    vi.mocked(api.updateBoard).mockRejectedValue(conflict());
    vi.mocked(api.getBoard).mockResolvedValue({
      id: 'b1', name: 'Server name', version: 9, updatedAt: 'x', createdAt: 'x',
      scene: { type: 'chalk/scene', version: 1, elements: [{ id: 'a' } as unknown as ChalkElement] },
    } as Board);
    setState({ elements: [el('a')] });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(getState().saveStatus).toBe('conflict');
  });

  it('forceSave sends no baseVersion and un-pauses autosave', async () => {
    vi.mocked(api.updateBoard).mockRejectedValueOnce(conflict()).mockResolvedValue(summary(10));
    vi.mocked(api.getBoard).mockRejectedValue(new TypeError('offline'));
    setState({ elements: [el('a')] });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(getState().saveStatus).toBe('conflict');

    await forceSave();
    const body = vi.mocked(api.updateBoard).mock.calls[1]![1];
    expect('baseVersion' in body).toBe(false);
    expect(body.scene?.elements).toHaveLength(1);
    expect(getState().saveStatus).toBe('saved');
    expect(getState().board?.version).toBe(10);

    // Autosave works again.
    setState({ elements: [el('a'), el('b')] });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(api.updateBoard).toHaveBeenCalledTimes(3);
    expect(vi.mocked(api.updateBoard).mock.calls[2]![1].baseVersion).toBe(10);
  });
});

describe('errors', () => {
  it('writes a backup and retries with exponential backoff capped at the max', async () => {
    vi.mocked(api.updateBoard).mockRejectedValue(new TypeError('offline'));
    setState({ elements: [el('a')] });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(getState().saveStatus).toBe('error');
    expect(writeBackup).toHaveBeenCalledTimes(1);
    const backup = vi.mocked(writeBackup).mock.calls[0]![0];
    expect(backup).toMatchObject({ boardId: 'b1', baseVersion: 1, name: 'N' });
    expect(backup.scene.elements).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(AUTOSAVE_RETRY_BASE_MS - 1);
    expect(api.updateBoard).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.updateBoard).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(AUTOSAVE_RETRY_BASE_MS * 2 - 1);
    expect(api.updateBoard).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.updateBoard).toHaveBeenCalledTimes(3);

    // Keep failing: the delay never exceeds the cap.
    for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(AUTOSAVE_RETRY_MAX_MS);
    const calls = vi.mocked(api.updateBoard).mock.calls.length;
    await vi.advanceTimersByTimeAsync(AUTOSAVE_RETRY_MAX_MS);
    expect(vi.mocked(api.updateBoard).mock.calls.length).toBe(calls + 1);
  });

  it('recovers when a retry succeeds', async () => {
    vi.mocked(api.updateBoard).mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValue(summary(2));
    setState({ elements: [el('a')] });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(getState().saveStatus).toBe('error');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_RETRY_BASE_MS);
    expect(getState().saveStatus).toBe('saved');
    expect(getState().board?.version).toBe(2);
  });

  it('404 sets error, writes a backup and does not retry', async () => {
    vi.mocked(api.updateBoard).mockRejectedValue(new ApiError(404, { detail: 'Board not found' }));
    setState({ elements: [el('a')] });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(getState().saveStatus).toBe('error');
    expect(getState().toast?.message).toBe('This board no longer exists on the server');
    expect(writeBackup).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_RETRY_MAX_MS * 3);
    expect(api.updateBoard).toHaveBeenCalledTimes(1);
  });
});

describe('flushSave', () => {
  it('saves immediately without waiting for the debounce', async () => {
    vi.mocked(api.updateBoard).mockResolvedValue(summary(2));
    setState({ elements: [el('a')] });
    await flushSave();
    expect(api.updateBoard).toHaveBeenCalledTimes(1);
    expect(getState().saveStatus).toBe('saved');
    // The debounce timer must not fire a second save.
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MAX_WAIT_MS);
    expect(api.updateBoard).toHaveBeenCalledTimes(1);
  });

  it('resolves immediately when clean', async () => {
    await flushSave();
    expect(api.updateBoard).not.toHaveBeenCalled();
  });

  it('passes keepalive through', async () => {
    vi.mocked(api.updateBoard).mockResolvedValue(summary(2));
    setState({ elements: [el('a')] });
    await flushSave({ keepalive: true });
    expect(vi.mocked(api.updateBoard).mock.calls[0]![2]).toEqual({ keepalive: true });
  });

  it('waits for an in-flight save and then saves the newer edits', async () => {
    const first = deferred<BoardSummary>();
    vi.mocked(api.updateBoard).mockReturnValueOnce(first.promise).mockResolvedValue(summary(3));
    setState({ elements: [el('a')] });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    setState({ elements: [el('a'), el('b')] });
    let done = false;
    const p = flushSave().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(10);
    expect(done).toBe(false);
    first.resolve(summary(2));
    await p;
    expect(api.updateBoard).toHaveBeenCalledTimes(2);
    expect(getState().board?.version).toBe(3);
    expect(isDirty()).toBe(false);
  });

  it('rejects when the save fails', async () => {
    vi.mocked(api.updateBoard).mockRejectedValue(new TypeError('offline'));
    setState({ elements: [el('a')] });
    await expect(flushSave()).rejects.toThrow('save failed: error');
  });

  it('rejects when in conflict', async () => {
    vi.mocked(api.updateBoard).mockRejectedValue(conflict());
    vi.mocked(api.getBoard).mockRejectedValue(new TypeError('offline'));
    setState({ elements: [el('a')] });
    await expect(flushSave()).rejects.toThrow('save failed: conflict');
    await expect(flushSave()).rejects.toThrow('save failed: conflict');
  });
});

describe('lifecycle', () => {
  it('detach is idempotent and stops the subscription', async () => {
    detach();
    detach();
    setState({ elements: [el('a')] });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MAX_WAIT_MS);
    expect(api.updateBoard).not.toHaveBeenCalled();
  });

  it('startAutosave twice leaves one live subscription', async () => {
    vi.mocked(api.updateBoard).mockResolvedValue(summary(2));
    const second = startAutosave();
    setState({ elements: [el('a')] });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(api.updateBoard).toHaveBeenCalledTimes(1);
    second();
  });

  it('does nothing while loading or without a board', async () => {
    setState({ saveStatus: 'loading' });
    setState({ elements: [el('a')] });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MAX_WAIT_MS);
    expect(api.updateBoard).not.toHaveBeenCalled();
    setState({ board: null, elements: [el('b')] });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MAX_WAIT_MS);
    expect(api.updateBoard).not.toHaveBeenCalled();
  });
});

describe('leaving the page', () => {
  it('pagehide with unsaved changes writes a backup and sends a keepalive save', async () => {
    const handlers = new Map<string, () => void>();
    vi.stubGlobal('window', {
      addEventListener: (t: string, h: () => void) => handlers.set(t, h),
      removeEventListener: (t: string) => handlers.delete(t),
    });
    vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn(), visibilityState: 'hidden' });
    try {
      detach();
      detach = startAutosave();
      vi.mocked(api.updateBoard).mockResolvedValue(summary(2));
      setState({ elements: [el('a')] });
      handlers.get('pagehide')!();
      expect(writeBackup).toHaveBeenCalledTimes(1);
      expect(vi.mocked(api.updateBoard).mock.calls[0]![2]).toEqual({ keepalive: true });
      await vi.advanceTimersByTimeAsync(0);

      vi.mocked(writeBackup).mockClear();
      handlers.get('pagehide')!(); // clean now: nothing to do
      expect(writeBackup).not.toHaveBeenCalled();
      detach();
      expect(handlers.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
