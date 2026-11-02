import { describe, expect, it } from 'vitest';
import { cleanOrigins, isEmbedded, isTerminalToggleKey, originOf, parseBoardParam, parseEmbedFlag, parseInbound, targetOrigins } from './embed';

const ORIGINS = ['http://localhost:8090', 'http://127.0.0.1:8090'];
const ok = (data: unknown, origin = 'http://localhost:8090') => parseInbound({ origin, data }, ORIGINS);

describe('query parsing', () => {
  it('embed=1 only', () => {
    expect(parseEmbedFlag('?embed=1')).toBe(true);
    expect(parseEmbedFlag('?board=x&embed=1')).toBe(true);
    expect(parseEmbedFlag('?embed=0')).toBe(false);
    expect(parseEmbedFlag('?embed=true')).toBe(false);
    expect(parseEmbedFlag('')).toBe(false);
  });
  it('board param', () => {
    expect(parseBoardParam('?board=abc123&embed=1')).toBe('abc123');
    expect(parseBoardParam('?board=')).toBeNull();
    expect(parseBoardParam('')).toBeNull();
  });
  it('isEmbedded needs a frame and embed=1', () => {
    const top = {} as { parent: unknown; self?: unknown };
    top.parent = top;
    expect(isEmbedded('?embed=1', top)).toBe(false);
    expect(isEmbedded('?embed=1', { parent: {}, self: {} })).toBe(true);
    expect(isEmbedded('', { parent: {}, self: {} })).toBe(false);
    expect(isEmbedded('?embed=1', undefined)).toBe(false);
  });
});

describe('parseInbound', () => {
  it('accepts the three commands', () => {
    expect(ok({ source: 'atlas', type: 'chalk:set-sidebar', open: true })).toEqual({ kind: 'set-sidebar', open: true });
    expect(ok({ source: 'atlas', type: 'chalk:toggle-sidebar' }, 'http://127.0.0.1:8090')).toEqual({ kind: 'toggle-sidebar' });
    expect(ok({ source: 'atlas', type: 'chalk:open-board', id: 'p1' })).toEqual({ kind: 'open-board', id: 'p1' });
  });
  it('accepts library-changed (D24) with the same validation', () => {
    expect(ok({ source: 'atlas', type: 'chalk:library-changed' })).toEqual({ kind: 'library-changed' });
    expect(ok({ source: 'atlas', type: 'chalk:library-changed' }, 'http://evil.example')).toBeNull();
    expect(ok({ source: 'chalk', type: 'chalk:library-changed' })).toBeNull();
    expect(ok({ type: 'chalk:library-changed' })).toBeNull();
  });
  it('ignores a wrong origin', () => {
    expect(ok({ source: 'atlas', type: 'chalk:toggle-sidebar' }, 'http://evil.example')).toBeNull();
    expect(ok({ source: 'atlas', type: 'chalk:toggle-sidebar' }, 'null')).toBeNull();
  });
  it('ignores a wrong source', () => {
    expect(ok({ source: 'chalk', type: 'chalk:toggle-sidebar' })).toBeNull();
    expect(ok({ type: 'chalk:toggle-sidebar' })).toBeNull();
  });
  it('ignores malformed messages', () => {
    expect(ok(null)).toBeNull();
    expect(ok('chalk:toggle-sidebar')).toBeNull();
    expect(ok({ source: 'atlas', type: 'chalk:set-sidebar', open: 'yes' })).toBeNull();
    expect(ok({ source: 'atlas', type: 'chalk:open-board' })).toBeNull();
    expect(ok({ source: 'atlas', type: 'chalk:open-board', id: '' })).toBeNull();
    expect(ok({ source: 'atlas', type: 'chalk:open-board', id: 5 })).toBeNull();
    expect(ok({ source: 'atlas', type: 'chalk:open-board', id: 'x'.repeat(500) })).toBeNull();
    expect(ok({ source: 'atlas', type: 'chalk:nope' })).toBeNull();
  });
});

describe('origins', () => {
  it('cleanOrigins drops junk', () => {
    expect(cleanOrigins(['http://a:1/', 'http://a:1', '*', 'javascript:x', 5, 'http://b'])).toEqual(['http://a:1', 'http://b']);
    expect(cleanOrigins(undefined)).toEqual([]);
  });
  it('targetOrigins prefers a known allowed parent', () => {
    expect(targetOrigins(ORIGINS, 'http://127.0.0.1:8090')).toEqual(['http://127.0.0.1:8090']);
    expect(targetOrigins(ORIGINS, 'http://evil.example')).toEqual(ORIGINS);
    expect(targetOrigins(ORIGINS, null)).toEqual(ORIGINS);
  });
  it('originOf', () => {
    expect(originOf('http://localhost:8090/some/path?x=1')).toBe('http://localhost:8090');
    expect(originOf('')).toBeNull();
    expect(originOf('nonsense')).toBeNull();
  });
});

describe('isTerminalToggleKey', () => {
  it('matches Ctrl+backquote only', () => {
    expect(isTerminalToggleKey({ code: 'Backquote', ctrlKey: true })).toBe(true);
    expect(isTerminalToggleKey({ code: 'Backquote', ctrlKey: false, metaKey: true })).toBe(true);
    expect(isTerminalToggleKey({ code: 'Backquote', ctrlKey: false })).toBe(false);
    expect(isTerminalToggleKey({ code: 'Backquote', ctrlKey: true, altKey: true })).toBe(false);
    expect(isTerminalToggleKey({ code: 'Backquote', ctrlKey: true, repeat: true })).toBe(false);
    expect(isTerminalToggleKey({ code: 'KeyA', ctrlKey: true })).toBe(false);
  });
});
