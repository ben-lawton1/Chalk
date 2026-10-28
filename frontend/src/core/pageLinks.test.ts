import { describe, expect, it } from 'vitest';
import type { LibraryTree } from '../types';
import { listPages, rankPages, resolvePageLink } from './pageLinks';

function page(id: string, name: string) {
  return { id, name, version: 1, updatedAt: '2026-01-01T00:00:00.000Z', notebook: '', section: '' };
}
const tree: LibraryTree = {
  path: 'lib',
  notebooks: [
    { name: 'Physics', sections: [
      { name: 'Mechanics', pages: [page('p1', 'Forces'), page('p2', 'Energy'), page('cur', 'Current page')] },
      { name: 'Optics', pages: [page('p3', 'Lenses'), page('p4', 'Energy levels')] },
    ] },
    { name: 'Maths', sections: [{ name: 'Algebra', pages: [page('m1', 'Groups'), page('m2', 'Energy of groups')] }] },
  ],
};
const cur = { id: 'cur', notebook: 'Physics', section: 'Mechanics' };

describe('resolvePageLink', () => {
  it('uses the live name by id', () => {
    expect(resolvePageLink(tree, 'p1', 'old name')).toEqual({ name: 'Forces', exists: true, path: 'Physics › Mechanics' });
  });
  it('falls back to the label and flags a missing page', () => {
    expect(resolvePageLink(tree, 'gone', 'Old')).toEqual({ name: 'Old', exists: false, path: '' });
  });
  it('treats an unloaded library as existing', () => {
    expect(resolvePageLink(null, 'x', 'Label')).toEqual({ name: 'Label', exists: true, path: '' });
  });
});

describe('rankPages', () => {
  it('lists every page except the current one, current section first, then notebook, then the rest', () => {
    expect(rankPages(tree, '', cur).map((p) => p.id)).toEqual(['p2', 'p1', 'p4', 'p3', 'm2', 'm1']);
  });
  it('filters by name, case-insensitively, keeping the place order', () => {
    expect(rankPages(tree, 'ENERGY', cur).map((p) => p.id)).toEqual(['p2', 'p4', 'm2']);
  });
  it('ranks better matches first within a group', () => {
    expect(rankPages(tree, 'groups', cur).map((p) => p.id)).toEqual(['m1', 'm2']);
    expect(rankPages(tree, 'opt', cur).map((p) => p.id)).toEqual(['p4', 'p3']); // section name match only
  });
  it('word-start beats a mid-word match', () => {
    const t: LibraryTree = { path: '', notebooks: [{ name: 'A', sections: [{ name: 'B', pages: [page('a', 'Xenergy'), page('b', 'Big energy')] }] }] };
    expect(rankPages(t, 'ener', { id: null, notebook: 'A', section: 'B' }).map((p) => p.id)).toEqual(['b', 'a']);
  });
  it('respects the limit and a missing library', () => {
    expect(rankPages(tree, '', cur, 2)).toHaveLength(2);
    expect(rankPages(null, 'x', cur)).toEqual([]);
    expect(listPages(null)).toEqual([]);
  });
});
