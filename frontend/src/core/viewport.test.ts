// Unit tests for core/viewport (WP0).
import { describe, expect, it } from 'vitest';
import { clampViewport, clampZoom, fitToBounds, pageOrigin, panBy, screenToWorld, viewportCenter, visibleWorldRect, worldToScreen, zoomAt } from './viewport';
import { MAX_ZOOM, MIN_ZOOM, PAGE_MARGIN } from '../constants';

const v = { scrollX: 37, scrollY: -120, zoom: 1.7 };

describe('world/screen transforms', () => {
  it('round trips', () => {
    const p = { x: 123.5, y: -77.25 };
    const back = screenToWorld(worldToScreen(p, v), v);
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });
  it('matches screen = (world + scroll) * zoom', () => {
    expect(worldToScreen({ x: 10, y: 20 }, v)).toEqual({ x: (10 + 37) * 1.7, y: (20 - 120) * 1.7 });
  });
});

describe('clampZoom', () => {
  it('clamps to the limits and repairs non-finite values', () => {
    expect(clampZoom(0.001)).toBe(MIN_ZOOM);
    expect(clampZoom(1000)).toBe(MAX_ZOOM);
    expect(clampZoom(2)).toBe(2);
    expect(clampZoom(NaN)).toBe(1);
    expect(clampZoom(Infinity)).toBe(1);
  });
});

describe('zoomAt', () => {
  it('keeps the world point under the anchor fixed', () => {
    const anchor = { x: 400, y: 300 };
    const before = screenToWorld(anchor, v);
    for (const z of [0.5, 1, 3.3, 12]) {
      const next = zoomAt(v, z, anchor);
      const after = screenToWorld(anchor, next);
      expect(Math.abs(after.x - before.x)).toBeLessThan(1e-9);
      expect(Math.abs(after.y - before.y)).toBeLessThan(1e-9);
      expect(next.zoom).toBe(z);
    }
  });
  it('clamps the zoom and still keeps the anchor fixed', () => {
    const anchor = { x: 100, y: 50 };
    const next = zoomAt(v, 1000, anchor);
    expect(next.zoom).toBe(MAX_ZOOM);
    const a = screenToWorld(anchor, v);
    const b = screenToWorld(anchor, next);
    expect(Math.abs(a.x - b.x)).toBeLessThan(1e-9);
  });
});

describe('panBy', () => {
  it('moves content with the pointer', () => {
    const next = panBy({ scrollX: 0, scrollY: 0, zoom: 2 }, 20, -10);
    expect(next).toEqual({ scrollX: 10, scrollY: -5, zoom: 2 });
    expect(worldToScreen({ x: 0, y: 0 }, next)).toEqual({ x: 20, y: -10 });
  });
});

describe('fitToBounds', () => {
  const size = { width: 1000, height: 800 };
  it('returns the identity for null bounds', () => {
    expect(fitToBounds(null, size)).toEqual({ scrollX: 0, scrollY: 0, zoom: 1 });
  });
  it('centers the bounds in the viewport', () => {
    const b = { x: 100, y: 200, width: 400, height: 200 };
    const f = fitToBounds(b, size);
    const c = worldToScreen({ x: 300, y: 300 }, f);
    expect(c.x).toBeCloseTo(500, 9);
    expect(c.y).toBeCloseTo(400, 9);
  });
  it('respects maxZoom', () => {
    const f = fitToBounds({ x: 0, y: 0, width: 10, height: 10 }, size, { maxZoom: 1 });
    expect(f.zoom).toBe(1);
    expect(fitToBounds({ x: 0, y: 0, width: 10, height: 10 }, size).zoom).toBe(2);
  });
  it('zooms out for large content', () => {
    const f = fitToBounds({ x: 0, y: 0, width: 4000, height: 100 }, size, { padding: 0 });
    expect(f.zoom).toBeCloseTo(0.25, 9);
  });
  it('handles a zero-size viewport', () => {
    expect(fitToBounds({ x: 10, y: 20, width: 5, height: 5 }, { width: 0, height: 0 })).toEqual({ scrollX: 54, scrollY: 44, zoom: 1 });
  });
});

describe('visibleWorldRect and viewportCenter', () => {
  it('derives the visible rect', () => {
    expect(visibleWorldRect({ scrollX: -10, scrollY: -20, zoom: 2 }, { width: 200, height: 100 })).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    expect(viewportCenter({ width: 200, height: 100 })).toEqual({ x: 100, y: 50 });
  });
});

describe('pageOrigin and clampViewport', () => {
  it('the origin is (0, 0) with no content or content inside the page', () => {
    expect(pageOrigin(null)).toEqual({ x: 0, y: 0 });
    expect(pageOrigin({ x: 100, y: 50, width: 10, height: 10 })).toEqual({ x: 0, y: 0 });
    expect(pageOrigin({ x: PAGE_MARGIN, y: PAGE_MARGIN, width: 10, height: 10 })).toEqual({ x: 0, y: 0 });
  });
  it('the origin moves up/left to keep negative content reachable, with a margin', () => {
    expect(pageOrigin({ x: -200, y: 10, width: 10, height: 10 })).toEqual({ x: -200 - PAGE_MARGIN, y: 10 - PAGE_MARGIN });
    expect(pageOrigin({ x: 60, y: -70, width: 10, height: 10 })).toEqual({ x: 0, y: -70 - PAGE_MARGIN });
  });
  it('non-finite bounds fall back to 0', () => {
    expect(pageOrigin({ x: NaN, y: Infinity, width: 1, height: 1 })).toEqual({ x: 0, y: 0 });
  });
  it('clamps so nothing above/left of the origin is visible', () => {
    expect(clampViewport({ scrollX: 40, scrollY: 12, zoom: 2 }, { x: 0, y: 0 })).toEqual({ scrollX: 0, scrollY: 0, zoom: 2 });
    expect(clampViewport({ scrollX: -40, scrollY: 12, zoom: 2 }, { x: 0, y: 0 })).toEqual({ scrollX: -40, scrollY: 0, zoom: 2 });
    expect(clampViewport({ scrollX: 300, scrollY: 0, zoom: 1 }, { x: -100, y: -50 })).toEqual({ scrollX: 100, scrollY: 0, zoom: 1 });
  });
  it('returns the same object when nothing changes', () => {
    const view = { scrollX: -10, scrollY: -10, zoom: 1 };
    expect(clampViewport(view, { x: 0, y: 0 })).toBe(view);
    expect(clampViewport(view, { x: -50, y: -50 })).toBe(view);
  });
  it('zooming out near the origin keeps the origin pinned top-left', () => {
    const z = clampViewport(zoomAt({ scrollX: 0, scrollY: 0, zoom: 1 }, 0.5, { x: 400, y: 300 }), { x: 0, y: 0 });
    expect(z).toEqual({ scrollX: 0, scrollY: 0, zoom: 0.5 });
  });
});
