// Unit tests for the pen button classification and the double-tap tracker (v3).
import { describe, expect, it } from 'vitest';
import { DOUBLE_TAP_MS, DOUBLE_TAP_SLOP_PX } from '../constants';
import { classifyPen } from './penButtons';
import { createTapTracker } from './taps';

describe('classifyPen', () => {
  it.each([
    ['tip down', 0, 1],
    ['tip down with no buttons bit', 0, 0],
    ['hover', -1, 0],
  ])('%s is the tip', (_n, button, buttons) => {
    expect(classifyPen(button, buttons, false)).toBe('tip');
  });
  it('the eraser signal erases: button 5, buttons & 32, also together with the tip bit', () => {
    expect(classifyPen(5, 0, false)).toBe('erase');
    expect(classifyPen(0, 32, false)).toBe('erase');
    expect(classifyPen(0, 33, false)).toBe('erase');
    expect(classifyPen(5, 32, false)).toBe('erase');
  });
  it('the barrel signal lassos: button 2 or buttons & 2', () => {
    expect(classifyPen(2, 2, false)).toBe('lasso');
    expect(classifyPen(0, 3, false)).toBe('lasso');
    expect(classifyPen(2, 0, false)).toBe('lasso');
  });
  it('the eraser signal wins when both are reported', () => {
    expect(classifyPen(0, 34, false)).toBe('erase');
  });
  it('swapping exchanges the two and leaves the tip alone', () => {
    expect(classifyPen(5, 32, true)).toBe('lasso');
    expect(classifyPen(2, 2, true)).toBe('erase');
    expect(classifyPen(0, 1, true)).toBe('tip');
  });
});

describe('createTapTracker', () => {
  function clock() {
    const c = { t: 1000 };
    return { c, now: () => c.t };
  }
  it('two close taps in time and space are a double tap, and the third starts over', () => {
    const { c, now } = clock();
    const tr = createTapTracker(now);
    expect(tr.tap({ x: 100, y: 100 })).toBe(false);
    c.t += DOUBLE_TAP_MS - 1;
    expect(tr.tap({ x: 110, y: 100 })).toBe(true);
    c.t += 10;
    expect(tr.tap({ x: 110, y: 100 })).toBe(false);
  });
  it('too slow or too far apart is not a double tap', () => {
    const { c, now } = clock();
    const tr = createTapTracker(now);
    tr.tap({ x: 0, y: 0 });
    c.t += DOUBLE_TAP_MS + 1;
    expect(tr.tap({ x: 0, y: 0 })).toBe(false);
    c.t += 10;
    expect(tr.tap({ x: DOUBLE_TAP_SLOP_PX + 1, y: 0 })).toBe(false);
    c.t += 10;
    expect(tr.tap({ x: DOUBLE_TAP_SLOP_PX + 1, y: 0 })).toBe(true);
  });
  it('reset forgets the previous tap', () => {
    const { now } = clock();
    const tr = createTapTracker(now);
    tr.tap({ x: 0, y: 0 });
    tr.reset();
    expect(tr.tap({ x: 0, y: 0 })).toBe(false);
  });
});
