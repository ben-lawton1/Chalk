import { describe, expect, it } from 'vitest';
import { TABLE_MAX_COLS, TABLE_MAX_ROWS } from '../../constants';
import { SLASH_COMMANDS, clampTableDim, clampTableSize, filterCommands, parseTableArgs } from './commands';

const ids = (q: string): string[] => filterCommands(SLASH_COMMANDS, q).map((c) => c.id);

describe('filterCommands', () => {
  it('returns every command in registry order for an empty query', () => {
    expect(ids('')).toEqual(SLASH_COMMANDS.map((c) => c.id));
    expect(ids('   ')).toHaveLength(SLASH_COMMANDS.length);
  });
  it('matches titles and aliases, case-insensitively', () => {
    expect(ids('H2')[0]).toBe('h2');
    expect(ids('TODO')).toEqual(['todo']);
    expect(ids('checkbox')).toEqual(['todo']);
    expect(ids('ul')).toContain('bullet');
  });
  it('ranks an exact match, then title prefixes, then alias prefixes', () => {
    expect(ids('code')[0]).toBe('code');
    expect(ids('code')).toContain('inline');
    expect(ids('h').slice(0, 4)).toEqual(['h1', 'h2', 'h3', 'highlight']); // exact alias "h" on Heading 1 first, then title prefixes in registry order
    expect(ids('list').slice(0, 3)).toEqual(['bullet', 'numbered', 'todo']);
  });
  it('puts a title prefix before an alias prefix before a substring', () => {
    const cmds = [
      { title: 'Zebra', aliases: ['stripe'] },
      { title: 'Alpha', aliases: ['strand'] },
      { title: 'Strong', aliases: [] },
      { title: 'Bad strat', aliases: [] },
      { title: 'Constr', aliases: [] },
    ];
    expect(filterCommands(cmds, 'str').map((c) => c.title)).toEqual(['Strong', 'Zebra', 'Alpha', 'Bad strat', 'Constr']);
  });
  it('finds multi-word titles whole and by first word', () => {
    expect(ids('heading 1')).toEqual(['h1']);
    expect(ids('table 4x5')).toEqual(['table']);
    expect(ids('table 4 5')).toEqual(['table']);
  });
  it('returns an empty list when nothing matches', () => {
    expect(ids('zzzz')).toEqual([]);
  });
  it('has unique ids and a command for every item the plan lists', () => {
    const all = SLASH_COMMANDS.map((c) => c.id);
    expect(new Set(all).size).toBe(all.length);
    for (const id of ['text', 'h1', 'h2', 'h3', 'bullet', 'numbered', 'todo', 'toggle', 'quote', 'divider', 'callout', 'code', 'inline', 'table', 'page', 'newpage', 'url', 'highlight', 'bold', 'italic', 'strike']) {
      expect(all).toContain(id);
    }
  });
});

describe('parseTableArgs', () => {
  it('reads RxC and "R C" forms (rows first)', () => {
    expect(parseTableArgs('table 4x5')).toEqual({ rows: 4, cols: 5 });
    expect(parseTableArgs('table 4 5')).toEqual({ rows: 4, cols: 5 });
    expect(parseTableArgs('Table 2 x 3')).toEqual({ rows: 2, cols: 3 });
    expect(parseTableArgs('table 2×3 ')).toEqual({ rows: 2, cols: 3 });
  });
  it('clamps to the limits and to at least 1', () => {
    expect(parseTableArgs('table 999x999')).toEqual({ rows: TABLE_MAX_ROWS, cols: TABLE_MAX_COLS });
    expect(parseTableArgs('table 0x0')).toEqual({ rows: 1, cols: 1 });
    expect(parseTableArgs('table 12345678901234 3')).toBeNull();
  });
  it('returns null for anything else', () => {
    for (const q of ['table', 'table 4', 'table x', 'tabl 4x5', 'table 4x5x6', 'table -1x2', 'h1 2x3', '']) expect(parseTableArgs(q)).toBeNull();
  });
});

describe('clamping', () => {
  it('clampTableDim', () => {
    expect(clampTableDim(NaN, 10)).toBe(1);
    expect(clampTableDim(-4, 10)).toBe(1);
    expect(clampTableDim(3.9, 10)).toBe(3);
    expect(clampTableDim(11, 10)).toBe(10);
  });
  it('clampTableSize', () => {
    expect(clampTableSize(100, 100)).toEqual({ rows: TABLE_MAX_ROWS, cols: TABLE_MAX_COLS });
    expect(clampTableSize(3, 3)).toEqual({ rows: 3, cols: 3 });
  });
});
