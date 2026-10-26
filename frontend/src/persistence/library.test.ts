// Tests for the library client: tree refresh and sync, folder/page operations and sidebar preferences.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetState, getState, setState } from '../state/store';
import type { Board, BoardSummary, LibraryTree } from '../types';
import { api } from './api';
import { markClean, resetAutosaveForTests } from './autosave';
import {
  SIDEBAR_STORAGE_KEY, addNotebook, addPage, addSection, deleteNotebook, deletePage, deleteSection, initSidebarPrefs,
  readSidebarPrefs, refreshLibrary, renameNotebook, renamePage, renameSection, startLibrarySync, writeSidebarPrefs,
} from './library';

vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  api: {
    health: vi.fn(),
    getConfig: vi.fn(),
    listBoards: vi.fn(),
    getBoard: vi.fn(),
    createBoard: vi.fn(),
    updateBoard: vi.fn(),
    deleteBoard: vi.fn(),
    getLibrary: vi.fn(),
    createNotebook: vi.fn(),
    renameNotebook: vi.fn(),
    deleteNotebook: vi.fn(),
    createSection: vi.fn(),
    renameSection: vi.fn(),
    deleteSection: vi.fn(),
  },
}));
vi.mock('./backup');

const page = (id: string, name: string, notebook = 'Work', section = 'Projects'): BoardSummary => ({
  id, name, version: 1, updatedAt: 'x', notebook, section,
});
const tree = (...pages: BoardSummary[]): LibraryTree => ({
  path: 'C:/lib',
  notebooks: [{ name: 'Work', sections: [{ name: 'Projects', pages }] }],
});
const full = (p: BoardSummary): Board => ({
  ...p, createdAt: 'x', scene: { type: 'chalk/scene', version: 4, elements: [] },
});
const here = (over: Record<string, unknown> = {}) => ({
  id: 'p1', name: 'Roadmap', version: 1, notebook: 'Work', section: 'Projects', ...over,
});

function stubStorage(initial: Record<string, string> = {}): Record<string, string> {
  const store = { ...initial };
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => (k in store ? store[k]! : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    location: { search: '' },
    history: { replaceState: vi.fn() },
  });
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAutosaveForTests();
  stubStorage();
  resetState({ board: here(), saveStatus: 'saved' });
  markClean();
  vi.mocked(api.getLibrary).mockResolvedValue(tree(page('p1', 'Roadmap')));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('refreshLibrary', () => {
  it('stores the tree', async () => {
    await refreshLibrary();
    expect(getState().library).toEqual(tree(page('p1', 'Roadmap')));
  });

  it('propagates a failure and keeps the old tree', async () => {
    await refreshLibrary();
    vi.mocked(api.getLibrary).mockRejectedValue(new TypeError('offline'));
    await expect(refreshLibrary()).rejects.toThrow('offline');
    expect(getState().library).not.toBeNull();
  });

  it('only the newest of two overlapping refreshes wins', async () => {
    let release!: (t: LibraryTree) => void;
    vi.mocked(api.getLibrary)
      .mockReturnValueOnce(new Promise<LibraryTree>((r) => { release = r; }))
      .mockResolvedValueOnce(tree(page('p1', 'Newest')));
    const slow = refreshLibrary();
    await refreshLibrary();
    release(tree(page('p1', 'Stale')));
    await slow;
    expect(getState().library?.notebooks[0]!.sections[0]!.pages[0]!.name).toBe('Newest');
  });

  it('syncs the open page after a folder was renamed in Explorer', async () => {
    vi.mocked(api.getLibrary).mockResolvedValue({
      path: 'C:/lib',
      notebooks: [{ name: 'Job', sections: [{ name: 'Plans', pages: [page('p1', 'Roadmap', 'Job', 'Plans')] }] }],
    });
    await refreshLibrary();
    expect(getState().board).toMatchObject({ notebook: 'Job', section: 'Plans' });
  });

  it('adopts a page name changed outside when the page is clean', async () => {
    vi.mocked(api.getLibrary).mockResolvedValue(tree(page('p1', 'Renamed outside')));
    await refreshLibrary();
    expect(getState().board?.name).toBe('Renamed outside');
  });

  it('never overwrites an unsaved local rename', async () => {
    setState({ saveStatus: 'dirty' });
    vi.mocked(api.getLibrary).mockResolvedValue(tree(page('p1', 'Renamed outside')));
    await refreshLibrary();
    expect(getState().board?.name).toBe('Roadmap');
  });
});

describe('startLibrarySync', () => {
  it('refreshes when another page is opened', async () => {
    const stop = startLibrarySync();
    setState({ board: here({ id: 'p2', name: 'Other' }) });
    await vi.waitFor(() => expect(api.getLibrary).toHaveBeenCalledTimes(1));
    stop();
  });

  it('refreshes after a save when the tree still shows the old name', async () => {
    await refreshLibrary();
    vi.mocked(api.getLibrary).mockClear();
    const stop = startLibrarySync();
    setState({ saveStatus: 'saving' });
    setState((s) => ({ board: s.board && { ...s.board, name: 'Roadmap 2' } }));
    setState({ saveStatus: 'saved' });
    await vi.waitFor(() => expect(api.getLibrary).toHaveBeenCalledTimes(1));
    stop();
  });

  it('does not refresh after a save that changed nothing', async () => {
    await refreshLibrary();
    vi.mocked(api.getLibrary).mockClear();
    const stop = startLibrarySync();
    setState({ saveStatus: 'saving' });
    setState({ saveStatus: 'saved' });
    expect(api.getLibrary).not.toHaveBeenCalled();
    stop();
  });
});

describe('creating', () => {
  it('addNotebook creates notebook, section and page with the names the server returned', async () => {
    vi.mocked(api.createNotebook).mockResolvedValue({ name: 'New Notebook (2)' });
    vi.mocked(api.createSection).mockResolvedValue({ name: 'Quick Notes' });
    vi.mocked(api.createBoard).mockResolvedValue(full(page('n1', 'Untitled page', 'New Notebook (2)', 'Quick Notes')));
    const place = await addNotebook();
    expect(api.createNotebook).toHaveBeenCalledWith('New Notebook');
    expect(api.createSection).toHaveBeenCalledWith('New Notebook (2)', 'Quick Notes');
    expect(api.createBoard).toHaveBeenCalledWith({ notebook: 'New Notebook (2)', section: 'Quick Notes' });
    expect(place).toEqual({ notebook: 'New Notebook (2)', section: 'Quick Notes', id: 'n1' });
    expect(getState().board?.id).toBe('n1');
  });

  it('addSection creates a section and one page in it', async () => {
    vi.mocked(api.createSection).mockResolvedValue({ name: 'New Section' });
    vi.mocked(api.createBoard).mockResolvedValue(full(page('s1', 'Untitled page', 'Work', 'New Section')));
    const place = await addSection('Work');
    expect(api.createSection).toHaveBeenCalledWith('Work', 'New Section');
    expect(place).toMatchObject({ notebook: 'Work', section: 'New Section', id: 's1' });
  });

  it('addPage opens the new page in the given section', async () => {
    vi.mocked(api.createBoard).mockResolvedValue(full(page('g1', 'Untitled page (2)')));
    const place = await addPage('Work', 'Projects');
    expect(api.createBoard).toHaveBeenCalledWith({ notebook: 'Work', section: 'Projects' });
    expect(place?.id).toBe('g1');
  });
});

describe('renaming', () => {
  it('renameNotebook and renameSection return the final names and refresh', async () => {
    vi.mocked(api.renameNotebook).mockResolvedValue({ name: 'Job (2)' });
    vi.mocked(api.renameSection).mockResolvedValue({ name: 'Plans-x' });
    expect(await renameNotebook('Work', 'Job')).toBe('Job (2)');
    expect(await renameSection('Work', 'Projects', 'Plans/x')).toBe('Plans-x');
    expect(api.renameNotebook).toHaveBeenCalledWith('Work', 'Job');
    expect(api.renameSection).toHaveBeenCalledWith('Work', 'Projects', 'Plans/x');
    expect(api.getLibrary).toHaveBeenCalledTimes(2);
  });

  it('renaming the open page goes through the autosave path', async () => {
    await renamePage('p1', 'Plan B');
    expect(getState().board?.name).toBe('Plan B');
    expect(api.updateBoard).not.toHaveBeenCalled();
  });

  it('renaming another page is a name-only PUT', async () => {
    vi.mocked(api.updateBoard).mockResolvedValue(page('p9', 'Ideas'));
    await renamePage('p9', 'Ideas');
    expect(api.updateBoard).toHaveBeenCalledWith('p9', { name: 'Ideas' });
    expect(api.getLibrary).toHaveBeenCalled();
  });
});

describe('deleting', () => {
  it('deletePage removes another page and refreshes', async () => {
    vi.mocked(api.deleteBoard).mockResolvedValue(undefined);
    await deletePage('p9');
    expect(api.deleteBoard).toHaveBeenCalledWith('p9');
    expect(getState().board?.id).toBe('p1');
    expect(api.getLibrary).toHaveBeenCalled();
  });

  it("deleting the open page's section opens the first remaining page", async () => {
    vi.mocked(api.deleteSection).mockResolvedValue(undefined);
    vi.mocked(api.listBoards).mockResolvedValue([page('q1', 'Left over', 'Home', 'Misc')]);
    vi.mocked(api.getBoard).mockResolvedValue(full(page('q1', 'Left over', 'Home', 'Misc')));
    await deleteSection('Work', 'Projects');
    expect(api.deleteSection).toHaveBeenCalledWith('Work', 'Projects');
    expect(getState().board?.id).toBe('q1');
  });

  it('deleting another section leaves the open page alone', async () => {
    vi.mocked(api.deleteSection).mockResolvedValue(undefined);
    await deleteSection('Work', 'Archive');
    expect(api.listBoards).not.toHaveBeenCalled();
    expect(getState().board?.id).toBe('p1');
  });

  it("deleting the open page's notebook with nothing left creates a page", async () => {
    vi.mocked(api.deleteNotebook).mockResolvedValue(undefined);
    vi.mocked(api.listBoards).mockResolvedValue([]);
    vi.mocked(api.createBoard).mockResolvedValue(full(page('z1', 'Untitled page', 'My Notebook', 'Quick Notes')));
    await deleteNotebook('Work');
    expect(api.createBoard).toHaveBeenCalledWith({});
    expect(getState().board?.id).toBe('z1');
  });
});

describe('sidebar preferences', () => {
  it('defaults to open with nothing expanded', () => {
    expect(readSidebarPrefs()).toEqual({ open: true, expanded: [] });
  });

  it('round-trips through localStorage', () => {
    const store = stubStorage();
    writeSidebarPrefs({ open: false, expanded: ['nb:Work', 'sec:Work/Projects'] });
    expect(JSON.parse(store[SIDEBAR_STORAGE_KEY]!)).toEqual({ open: false, expanded: ['nb:Work', 'sec:Work/Projects'] });
    expect(readSidebarPrefs()).toEqual({ open: false, expanded: ['nb:Work', 'sec:Work/Projects'] });
  });

  it('ignores corrupt data', () => {
    stubStorage({ [SIDEBAR_STORAGE_KEY]: '{nope' });
    expect(readSidebarPrefs()).toEqual({ open: true, expanded: [] });
    stubStorage({ [SIDEBAR_STORAGE_KEY]: JSON.stringify({ open: 'yes', expanded: [1, 'nb:A'] }) });
    expect(readSidebarPrefs()).toEqual({ open: true, expanded: ['nb:A'] });
  });

  it('initSidebarPrefs applies the remembered open state', () => {
    stubStorage({ [SIDEBAR_STORAGE_KEY]: JSON.stringify({ open: false, expanded: [] }) });
    initSidebarPrefs();
    expect(getState().sidebarOpen).toBe(false);
  });
});
