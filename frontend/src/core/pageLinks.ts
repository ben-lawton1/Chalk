// Page links in the notes (v4 N-C): resolving a stored link against the library tree, and ranking pages for the `@` picker.
import type { LibraryTree } from '../types';

export interface PageEntry {
  id: string;
  name: string;
  notebook: string;
  section: string;
}

/** Where the page being edited lives (it is excluded from the picker and decides the ranking). */
export interface CurrentPlace {
  id: string | null;
  notebook: string;
  section: string;
}

export const PAGE_PICKER_LIMIT = 30;

/** Every page in the tree, in sidebar order. */
export function listPages(library: LibraryTree | null): PageEntry[] {
  if (!library) return [];
  const out: PageEntry[] = [];
  for (const nb of library.notebooks) {
    for (const sec of nb.sections) {
      for (const p of sec.pages) out.push({ id: p.id, name: p.name, notebook: nb.name, section: sec.name });
    }
  }
  return out;
}

export interface ResolvedPageLink {
  /** The live page name, or the stored label when the page is unknown. */
  name: string;
  /** False only when the library is loaded and does not hold the id. */
  exists: boolean;
  /** `Notebook › Section` of the page, or '' when unknown. */
  path: string;
}

/** The chip's text: the live name by id, else the stored label. A page that no longer exists is flagged. */
export function resolvePageLink(library: LibraryTree | null, id: string, label: string): ResolvedPageLink {
  if (!library) return { name: label, exists: true, path: '' };
  const hit = listPages(library).find((p) => p.id === id);
  if (!hit) return { name: label, exists: false, path: '' };
  return { name: hit.name, exists: true, path: `${hit.notebook} › ${hit.section}` };
}

/** 0 prefix of the name, 1 a word of the name starts with it, 2 inside the name, 3 only in the notebook/section names, null no match. */
function matchTier(p: PageEntry, q: string): number | null {
  if (q === '') return 0;
  const name = p.name.toLowerCase();
  if (name.startsWith(q)) return 0;
  if (name.split(/[\s\-_.]+/).some((w) => w.startsWith(q))) return 1;
  if (name.includes(q)) return 2;
  if (`${p.notebook} ${p.section}`.toLowerCase().includes(q)) return 3;
  return null;
}

function placeRank(p: PageEntry, cur: CurrentPlace): number {
  if (p.notebook === cur.notebook && p.section === cur.section) return 0;
  if (p.notebook === cur.notebook) return 1;
  return 2;
}

/**
 * Pages for the picker: the current page excluded, filtered by the query, the current section first, then the current notebook, then
 * the rest; within each group better matches first, then alphabetical.
 */
export function rankPages(library: LibraryTree | null, query: string, cur: CurrentPlace, limit: number = PAGE_PICKER_LIMIT): PageEntry[] {
  const q = query.trim().toLowerCase();
  const scored: { p: PageEntry; place: number; tier: number }[] = [];
  for (const p of listPages(library)) {
    if (cur.id !== null && p.id === cur.id) continue;
    const tier = matchTier(p, q);
    if (tier === null) continue;
    scored.push({ p, place: placeRank(p, cur), tier });
  }
  scored.sort((a, b) => a.place - b.place || a.tier - b.tier || a.p.name.localeCompare(b.p.name, undefined, { sensitivity: 'base' }));
  return scored.slice(0, Math.max(0, limit)).map((s) => s.p);
}
