// Tests for the pen preferences (v3): validation, fallbacks and the save-on-change subscription.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PENS, PEN_PREFS_STORAGE_KEY } from '../constants';
import { getState, resetState } from '../state/store';
import { setActivePen, setPenButtonsSwapped, updatePen } from '../state/actions';
import { loadPenPrefs, savePenPrefs, startPenPrefs } from './penPrefs';

let store: Record<string, string>;

function stub(over: Partial<Storage> = {}): void {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => (k in store ? store[k]! : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      ...over,
    },
  });
}

beforeEach(() => {
  store = {};
  stub();
  resetState();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const pens3 = [{ color: '#111111', size: 2 }, { color: '#222222', size: 8 }, { color: '#333333', size: 12 }];

describe('loadPenPrefs', () => {
  it('gives the defaults when nothing is stored', () => {
    expect(loadPenPrefs()).toEqual({ pens: [...DEFAULT_PENS], activePen: 0, penButtonsSwapped: false });
  });
  it('round-trips what savePenPrefs wrote', () => {
    savePenPrefs({ pens: pens3, activePen: 2, penButtonsSwapped: true });
    expect(loadPenPrefs()).toEqual({ pens: pens3, activePen: 2, penButtonsSwapped: true });
  });
  it.each([
    ['not json', '{nope'],
    ['not an object', '42'],
    ['two pens', JSON.stringify({ pens: pens3.slice(0, 2), activePen: 1 })],
    ['four pens', JSON.stringify({ pens: [...pens3, pens3[0]], activePen: 1 })],
    ['a bad colour', JSON.stringify({ pens: [{ color: 5, size: 2 }, pens3[1], pens3[2]] })],
    ['a zero size', JSON.stringify({ pens: [{ color: '#fff', size: 0 }, pens3[1], pens3[2]] })],
    ['a NaN-like size', JSON.stringify({ pens: [{ color: '#fff', size: 'big' }, pens3[1], pens3[2]] })],
  ])('falls back to the default pens for %s', (_name, raw) => {
    store[PEN_PREFS_STORAGE_KEY] = raw;
    expect(loadPenPrefs().pens).toEqual([...DEFAULT_PENS]);
  });
  it('repairs a bad active index and a non-boolean swap flag', () => {
    store[PEN_PREFS_STORAGE_KEY] = JSON.stringify({ pens: pens3, activePen: 7, penButtonsSwapped: 'yes' });
    expect(loadPenPrefs()).toEqual({ pens: pens3, activePen: 0, penButtonsSwapped: false });
    store[PEN_PREFS_STORAGE_KEY] = JSON.stringify({ pens: pens3, activePen: 1.5 });
    expect(loadPenPrefs().activePen).toBe(0);
  });
  it('survives storage that throws', () => {
    stub({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(loadPenPrefs().pens).toEqual([...DEFAULT_PENS]);
    expect(() => savePenPrefs({ pens: pens3, activePen: 0, penButtonsSwapped: false })).not.toThrow();
  });
  it('survives having no window at all (node)', () => {
    vi.unstubAllGlobals();
    expect(loadPenPrefs().activePen).toBe(0);
  });
});

describe('startPenPrefs', () => {
  it('applies the stored prefs to the store', () => {
    store[PEN_PREFS_STORAGE_KEY] = JSON.stringify({ pens: pens3, activePen: 1, penButtonsSwapped: true });
    const stop = startPenPrefs();
    expect(getState().pens).toEqual(pens3);
    expect(getState().activePen).toBe(1);
    expect(getState().penButtonsSwapped).toBe(true);
    stop();
  });
  it('saves on every change to the pens, the active pen and the swap flag, and only then', () => {
    const stop = startPenPrefs();
    updatePen(1, { color: '#4dabf7', size: 12 });
    setActivePen(1);
    setPenButtonsSwapped(true);
    expect(JSON.parse(store[PEN_PREFS_STORAGE_KEY]!)).toEqual({
      pens: [DEFAULT_PENS[0], { color: '#4dabf7', size: 12 }, DEFAULT_PENS[2]], activePen: 1, penButtonsSwapped: true,
    });
    const before = store[PEN_PREFS_STORAGE_KEY];
    delete store[PEN_PREFS_STORAGE_KEY];
    resetState({ ...getState(), tool: 'rectangle' }); // unrelated change
    expect(store[PEN_PREFS_STORAGE_KEY]).toBeUndefined();
    expect(before).toBeDefined();
    stop();
    updatePen(0, { size: 8 });
    expect(store[PEN_PREFS_STORAGE_KEY]).toBeUndefined(); // unsubscribed
  });
});
