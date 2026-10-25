// Unit tests for core/ids (WP0).
import { describe, expect, it } from 'vitest';
import { isValidSeed, newId, newSeed } from './ids';

describe('newId', () => {
  it('is 12 chars from [A-Za-z0-9]', () => {
    for (let i = 0; i < 200; i++) expect(newId()).toMatch(/^[A-Za-z0-9]{12}$/);
  });
  it('gives 1000 unique ids', () => {
    expect(new Set(Array.from({ length: 1000 }, () => newId())).size).toBe(1000);
  });
});

describe('newSeed', () => {
  it('stays in [1, 2^31 - 2] and is never 0', () => {
    for (let i = 0; i < 2000; i++) {
      const s = newSeed();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(2 ** 31 - 2);
    }
  });
});

describe('isValidSeed', () => {
  it('accepts the range ends and rejects everything else', () => {
    expect(isValidSeed(1)).toBe(true);
    expect(isValidSeed(2 ** 31 - 2)).toBe(true);
    expect(isValidSeed(0)).toBe(false);
    expect(isValidSeed(2 ** 31 - 1)).toBe(false);
    expect(isValidSeed(1.5)).toBe(false);
    expect(isValidSeed(NaN)).toBe(false);
    expect(isValidSeed('7')).toBe(false);
    expect(isValidSeed(null)).toBe(false);
  });
});
