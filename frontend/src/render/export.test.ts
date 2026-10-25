// Tests for export helpers: file names and the export frame (WP2). Geometry is mocked so WP1 is not required.
import { describe, expect, it, vi } from 'vitest';
import type { ChalkElement, Rect } from '../types';
import { MAX_CANVAS_SIDE } from '../constants';
import { getCommonBounds } from '../core/geometry';
import { SceneParseError } from '../core/serialize';
import { computeExportFrame, importSceneJson, safeFileName } from './export';

vi.mock('../core/geometry', () => ({
  getCommonBounds: vi.fn(),
  getBounds: vi.fn(),
}));

const els = [{ id: 'a' }] as unknown as ChalkElement[];

function withBounds(r: Rect | null): void {
  vi.mocked(getCommonBounds).mockReturnValue(r);
}

describe('safeFileName', () => {
  it('keeps safe characters and turns whitespace into dashes', () => {
    expect(safeFileName('My board.v2_final')).toBe('My-board.v2_final');
    expect(safeFileName('  a   b  ')).toBe('a-b');
  });
  it('replaces unsafe characters with underscores', () => {
    expect(safeFileName('a/b\\c:d*e?"<>|')).toBe('a_b_c_d_e_____');
    expect(safeFileName('naïve')).toBe('na_ve');
  });
  it('truncates to 80 characters', () => {
    expect(safeFileName('x'.repeat(200))).toHaveLength(80);
  });
  it('falls back to chalk when empty', () => {
    expect(safeFileName('')).toBe('chalk');
    expect(safeFileName('   ')).toBe('chalk');
  });
});

describe('computeExportFrame', () => {
  it('is null for no elements and for null bounds', () => {
    expect(computeExportFrame([])).toBeNull();
    withBounds(null);
    expect(computeExportFrame(els)).toBeNull();
  });
  it('pads the bounds (default 32) and uses the default scale of 2', () => {
    withBounds({ x: 10, y: 20, width: 100, height: 50 });
    const f = computeExportFrame(els)!;
    expect(f.bounds).toEqual({ x: -22, y: -12, width: 164, height: 114 });
    expect(f.scale).toBe(2);
  });
  it('honours explicit padding and scale', () => {
    withBounds({ x: 0, y: 0, width: 100, height: 100 });
    const f = computeExportFrame(els, { padding: 10, scale: 3 })!;
    expect(f.bounds).toEqual({ x: -10, y: -10, width: 120, height: 120 });
    expect(f.scale).toBe(3);
  });
  it('reduces the scale so the longest side fits MAX_CANVAS_SIDE', () => {
    withBounds({ x: 0, y: 0, width: 20000, height: 100 });
    const f = computeExportFrame(els, { padding: 0 })!;
    expect(f.scale).toBeLessThan(1);
    expect(20000 * f.scale).toBeCloseTo(MAX_CANVAS_SIDE, 6);
  });
  it('does not touch the scale when it already fits', () => {
    withBounds({ x: 0, y: 0, width: 1000, height: 1000 });
    expect(computeExportFrame(els, { scale: 4, padding: 0 })!.scale).toBe(4);
  });
});

describe('importSceneJson', () => {
  it('rejects invalid JSON with a SceneParseError', async () => {
    const file = { text: () => Promise.resolve('{nope') } as unknown as File;
    await expect(importSceneJson(file)).rejects.toBeInstanceOf(SceneParseError);
    await expect(importSceneJson(file)).rejects.toThrow('File is not valid JSON');
  });
});
