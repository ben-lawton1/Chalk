// Notebook library client: tree refresh, notebook/section/page operations for the sidebar, and the sidebar preferences.
// Folder names are sent exactly as the tree returns them; the server may change a new name (suffix, "-"), so callers adopt what comes back.
import { getState, setState, subscribe } from '../state/store';
import type { BoardMeta, LibraryTree } from '../types';
import { api } from './api';
import { isDirty, markClean } from './autosave';
import { createBoard, deleteBoard, openFirstOrCreate, renameBoard } from './boards';

export const SIDEBAR_STORAGE_KEY = 'chalk:sidebar';
export const NEW_NOTEBOOK_NAME = 'New Notebook';
export const NEW_SECTION_NAME = 'New Section';
export const FIRST_SECTION_NAME = 'Quick Notes';

// ---------------------------------------------------------------------------
// Sidebar preferences (localStorage; every access guarded)
// ---------------------------------------------------------------------------

export interface SidebarPrefs {
  open: boolean;
  /** Expanded row keys: `nb:<name>` and `sec:<nb>/<sec>`. */
  expanded: string[];
}

export function readSidebarPrefs(): SidebarPrefs {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<SidebarPrefs> | null;
      if (v && typeof v === 'object') {
        return {
          open: typeof v.open === 'boolean' ? v.open : true,
          expanded: Array.isArray(v.expanded) ? v.expanded.filter((k): k is string => typeof k === 'string') : [],
        };
      }
    }
  } catch {
    /* storage unavailable or corrupt */
  }
  return { open: true, expanded: [] };
}

export function writeSidebarPrefs(prefs: SidebarPrefs): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

/** Applies the remembered open/closed state before the first render (no flash). */
export function initSidebarPrefs(): void {
  setState({ sidebarOpen: readSidebarPrefs().open });
}

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

let refreshSeq = 0;

/** Brings the open page's name/notebook/section in line with the tree (Explorer renames); never overwrites unsaved edits. */
function syncBoardFromTree(tree: LibraryTree): void {
  const b = getState().board;
  if (!b) return;
  for (const nb of tree.notebooks) {
    for (const sec of nb.sections) {
      const page = sec.pages.find((p) => p.id === b.id);
      if (!page) continue;
      const patch: Partial<BoardMeta> = {};
      if (page.notebook !== b.notebook) patch.notebook = page.notebook;
      if (page.section !== b.section) patch.section = page.section;
      const status = getState().saveStatus;
      if (page.name !== b.name && status === 'saved' && !isDirty()) {
        markClean(undefined, page.name); // adopt without triggering a save
        patch.name = page.name;
      }
      if (Object.keys(patch).length > 0) setState({ board: { ...b, ...patch } });
      return;
    }
  }
}

/** Fetches GET /library into state. Rejects when the library cannot be reached; only the newest request wins. */
export async function refreshLibrary(): Promise<void> {
  const seq = ++refreshSeq;
  const tree = await api.getLibrary();
  if (seq !== refreshSeq) return;
  setState({ library: tree });
  syncBoardFromTree(tree);
}

function refreshQuietly(): void {
  refreshLibrary().catch(() => undefined);
}

/** Keeps the tree fresh: when the open page changes, after a save changed its name, and when the window regains focus. */
export function startLibrarySync(): () => void {
  const unsubscribe = subscribe((s, prev) => {
    if (!s.board) return;
    if (s.board.id !== prev.board?.id) {
      refreshQuietly();
      return;
    }
    if (s.saveStatus === 'saved' && prev.saveStatus !== 'saved' && s.library) {
      const entry = s.library.notebooks.flatMap((n) => n.sections.flatMap((x) => x.pages)).find((p) => p.id === s.board!.id);
      if (!entry || entry.name !== s.board.name) refreshQuietly();
    }
  });
  const onFocus = (): void => refreshQuietly();
  if (typeof window !== 'undefined') window.addEventListener('focus', onFocus);
  return () => {
    unsubscribe();
    if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
  };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export interface NewPlace {
  notebook: string;
  section: string;
  /** Id of the new page that is now open. */
  id: string;
}

/** Creates a page in notebook/section and opens it; null when the switch did not happen (e.g. the old page could not be saved). */
export async function addPage(notebook: string, section: string): Promise<NewPlace | null> {
  const before = getState().board?.id;
  await createBoard(undefined, { notebook, section });
  const b = getState().board;
  await refreshLibrary();
  if (!b || b.id === before) return null;
  return { notebook: b.notebook, section: b.section, id: b.id };
}

/** New section in a notebook with one page, opened. */
export async function addSection(notebook: string): Promise<NewPlace | null> {
  const sec = await api.createSection(notebook, NEW_SECTION_NAME);
  return addPage(notebook, sec.name);
}

/** New notebook with one section and one page, opened. */
export async function addNotebook(): Promise<NewPlace | null> {
  const nb = await api.createNotebook(NEW_NOTEBOOK_NAME);
  const sec = await api.createSection(nb.name, FIRST_SECTION_NAME);
  return addPage(nb.name, sec.name);
}

/** Resolves to the final notebook name. */
export async function renameNotebook(notebook: string, name: string): Promise<string> {
  const r = await api.renameNotebook(notebook, name);
  await refreshLibrary();
  return r.name;
}

/** Resolves to the final section name. */
export async function renameSection(notebook: string, section: string, name: string): Promise<string> {
  const r = await api.renameSection(notebook, section, name);
  await refreshLibrary();
  return r.name;
}

/** The open page keeps its normal autosave path; any other page is renamed directly. */
export async function renamePage(id: string, name: string): Promise<void> {
  if (getState().board?.id === id) {
    renameBoard(name);
    return;
  }
  await api.updateBoard(id, { name });
  await refreshLibrary();
}

export async function deletePage(id: string): Promise<void> {
  await deleteBoard(id);
  await refreshLibrary();
}

export async function deleteSection(notebook: string, section: string): Promise<void> {
  const b = getState().board;
  const hit = b !== null && b.notebook === notebook && b.section === section;
  await api.deleteSection(notebook, section);
  if (hit) await openFirstOrCreate();
  await refreshLibrary();
}

export async function deleteNotebook(notebook: string): Promise<void> {
  const b = getState().board;
  const hit = b !== null && b.notebook === notebook;
  await api.deleteNotebook(notebook);
  if (hit) await openFirstOrCreate();
  await refreshLibrary();
}
