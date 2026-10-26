// Unit tests for the terminal panel preferences.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clampTerminalHeight, parseTerminalPrefs, readTerminalPrefs, TERMINAL_DEFAULT_HEIGHT, TERMINAL_MIN_HEIGHT, TERMINAL_STORAGE_KEY, writeTerminalPrefs,
} from './prefs';

afterEach(() => vi.unstubAllGlobals());

describe('clampTerminalHeight', () => {
  it('keeps the height between 120px and 70% of the window', () => {
    expect(clampTerminalHeight(50, 1000)).toBe(TERMINAL_MIN_HEIGHT);
    expect(clampTerminalHeight(400, 1000)).toBe(400);
    expect(clampTerminalHeight(900, 1000)).toBe(700);
    expect(clampTerminalHeight(300, 100)).toBe(TERMINAL_MIN_HEIGHT);
  });
  it('falls back to the default for NaN', () => {
    expect(clampTerminalHeight(NaN, 1000)).toBe(TERMINAL_DEFAULT_HEIGHT);
  });
});

describe('parseTerminalPrefs', () => {
  it('reads valid prefs', () => {
    expect(parseTerminalPrefs('{"open":true,"height":410}')).toEqual({ open: true, height: 410 });
  });
  it('defaults on null, junk and wrong types', () => {
    const d = { open: false, height: TERMINAL_DEFAULT_HEIGHT };
    expect(parseTerminalPrefs(null)).toEqual(d);
    expect(parseTerminalPrefs('not json')).toEqual(d);
    expect(parseTerminalPrefs('42')).toEqual(d);
    expect(parseTerminalPrefs('{"open":"yes","height":"tall"}')).toEqual(d);
  });
  it('raises a too-small saved height to the minimum', () => {
    expect(parseTerminalPrefs('{"open":true,"height":10}').height).toBe(TERMINAL_MIN_HEIGHT);
  });
});

describe('read and write', () => {
  it('round-trips through localStorage', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    writeTerminalPrefs({ open: true, height: 333 });
    expect(JSON.parse(store.get(TERMINAL_STORAGE_KEY)!)).toEqual({ open: true, height: 333 });
    expect(readTerminalPrefs()).toEqual({ open: true, height: 333 });
  });
  it('never throws when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    });
    expect(() => writeTerminalPrefs({ open: true, height: 300 })).not.toThrow();
    expect(readTerminalPrefs()).toEqual({ open: false, height: TERMINAL_DEFAULT_HEIGHT });
  });
});
