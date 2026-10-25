/**
 * Shared Playwright helpers for the Chalk e2e suite.
 *
 * Everything reads app state through window.__CHALK__ (the test hook), seeds boards
 * through the HTTP API, and drives the canvas with page.mouse. No fixed sleeps.
 */
import { test as base, expect, type Page, type APIRequestContext, type Download } from '@playwright/test';
import { TID, tidTool } from './testids';

export * from './testids';
export { expect };

export interface P { x: number; y: number }
export interface R { x: number; y: number; width: number; height: number }

type Mod = 'Shift' | 'Alt' | 'Control' | 'Space';

/**
 * base.extend with an auto fixture that collects `pageerror` and console `error`
 * messages (minus the browser's own "Failed to load resource" noise for intentional
 * 404/409/aborted requests) and expects none at teardown.
 */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const text = m.text();
        if (/Failed to load resource/.test(text)) return;
        errors.push(`console.error: ${text}`);
      });
      await use(errors);
      expect(errors, 'page errors').toEqual([]);
    },
    { auto: true },
  ],
});

// ---------------------------------------------------------------------------
// Page access (window.__CHALK__)
// ---------------------------------------------------------------------------

export function els(page: Page): Promise<any[]> {
  return page.evaluate(() => (window as any).__CHALK__.getElements());
}
export function app(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__CHALK__.getAppState());
}
export function selected(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as any).__CHALK__.getSelectedIds());
}
export async function byId(page: Page, id: string): Promise<any> {
  return (await els(page)).find((e) => e.id === id);
}
export async function last(page: Page): Promise<any> {
  const all = await els(page);
  return all[all.length - 1];
}
export function screenBounds(page: Page, id: string): Promise<R | null> {
  return page.evaluate((i) => (window as any).__CHALK__.getElementScreenBounds(i), id);
}
export function toScreen(page: Page, p: P): Promise<P> {
  return page.evaluate((q) => (window as any).__CHALK__.worldToScreen(q), p);
}
export function toWorld(page: Page, p: P): Promise<P> {
  return page.evaluate((q) => (window as any).__CHALK__.screenToWorld(q), p);
}
/** flushSave() -> 'ok' or the error message. Never throws. */
export function flush(page: Page): Promise<string> {
  return page.evaluate(async () => {
    try {
      await (window as any).__CHALK__.flushSave();
      return 'ok';
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  });
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

export async function newBoard(
  request: APIRequestContext,
  body: { name?: string; scene?: object } = {},
): Promise<{ id: string; version: number; name: string }> {
  const res = await request.post('/api/boards', { data: body });
  expect(res.status(), 'POST /api/boards').toBe(201);
  return res.json();
}

export async function getBoard(request: APIRequestContext, id: string): Promise<any> {
  const res = await request.get(`/api/boards/${id}`);
  expect(res.status(), `GET /api/boards/${id}`).toBe(200);
  return res.json();
}

export async function openBoard(page: Page, id: string, opts: { identityViewport?: boolean } = {}): Promise<void> {
  if (opts.identityViewport) {
    await page.addInitScript((boardId) => {
      try {
        const key = `chalk:viewport:${boardId}`;
        if (localStorage.getItem(key) === null) {
          localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }));
        }
      } catch {
        /* storage unavailable */
      }
    }, id);
  }
  await page.goto(`/?board=${id}`);
  await waitReady(page);
}

/** Poll isReady() then wait for the canvas to settle. */
export async function waitReady(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => (window as any).__CHALK__?.isReady?.() === true), { timeout: 15_000 })
    .toBe(true);
  await page.evaluate(() => (window as any).__CHALK__.whenRendered());
}

/** Empty board, identity viewport. Returns the board id. */
export async function freshBoard(page: Page, request: APIRequestContext, name?: string): Promise<string> {
  const b = await newBoard(request, name ? { name } : {});
  await openBoard(page, b.id);
  const a = await app(page);
  expect(a.boardId).toBe(b.id);
  expect(a.viewport).toEqual({ scrollX: 0, scrollY: 0, zoom: 1 });
  return b.id;
}

/** Board pre-filled through the API and opened with an identity viewport. */
export async function seededBoard(
  page: Page,
  request: APIRequestContext,
  elements: object[],
  name?: string,
): Promise<string> {
  const b = await newBoard(request, { ...(name ? { name } : {}), scene: scene(elements) });
  await openBoard(page, b.id, { identityViewport: true });
  return b.id;
}

// ---------------------------------------------------------------------------
// Scene builders
// ---------------------------------------------------------------------------

export function scene(elements: object[]): { type: 'chalk/scene'; version: 1; elements: object[] } {
  return { type: 'chalk/scene', version: 1, elements };
}
export function shapeEl(
  kind: 'rectangle' | 'diamond' | 'ellipse' | 'triangle',
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: object = {},
): object {
  return { id, type: 'shape', shape: kind, x, y, width, height, label: '', ...extra };
}
export function rectEl(id: string, x: number, y: number, width: number, height: number, extra: object = {}): object {
  return shapeEl('rectangle', id, x, y, width, height, extra);
}
export function textEl(id: string, x: number, y: number, text: string, extra: object = {}): object {
  return { id, type: 'text', x, y, text, autoResize: true, ...extra };
}
export function arrowEl(
  id: string,
  start: P,
  end: P,
  startId: string | null = null,
  endId: string | null = null,
  extra: object = {},
): object {
  return {
    id,
    type: 'arrow',
    start,
    end,
    startBinding: startId ? { elementId: startId, fixedPoint: [0.5, 0.5] } : null,
    endBinding: endId ? { elementId: endId, fixedPoint: [0.5, 0.5] } : null,
    label: '',
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Gestures
// ---------------------------------------------------------------------------

async function hold(page: Page, mods: Mod[] | undefined): Promise<void> {
  for (const m of mods ?? []) await page.keyboard.down(m);
}
async function release(page: Page, mods: Mod[] | undefined): Promise<void> {
  for (const m of [...(mods ?? [])].reverse()) await page.keyboard.up(m);
}

export async function drag(
  page: Page,
  from: P,
  to: P,
  opts: { steps?: number; button?: 'left' | 'middle'; hold?: Mod[] } = {},
): Promise<void> {
  const button = opts.button ?? 'left';
  await hold(page, opts.hold);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button });
  await page.mouse.move(to.x, to.y, { steps: opts.steps ?? 12 });
  await page.mouse.up({ button });
  await release(page, opts.hold);
}

/** Press a tool key, then drag. */
export async function draw(
  page: Page,
  toolKey: string,
  from: P,
  to: P,
  holdMods?: Array<'Shift' | 'Alt' | 'Control'>,
): Promise<void> {
  await page.keyboard.press(toolKey);
  await drag(page, from, to, { hold: holdMods });
}

/** Drag a palette button to a canvas point (from the center of its toolbar button). */
export async function paletteDrag(page: Page, kind: string, to: P, opts: { release?: boolean } = {}): Promise<void> {
  const box = await page.getByTestId(tidTool(kind)).boundingBox();
  if (!box) throw new Error(`no bounding box for ${tidTool(kind)}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  if (opts.release ?? true) await page.mouse.up();
}

export async function menu(page: Page, itemTid: string): Promise<void> {
  await page.getByTestId(TID.menuButton).click();
  await page.getByTestId(itemTid).click();
}

export async function download(page: Page, itemTid: string): Promise<Download> {
  const [dl] = await Promise.all([page.waitForEvent('download'), menu(page, itemTid)]);
  return dl;
}

/** Wait for the canvas to settle, then save artifacts/screens/<name>.png. */
export async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => (window as any).__CHALK__.whenRendered());
  await page.screenshot({ path: `artifacts/screens/${name}.png` });
}

// ---------------------------------------------------------------------------
// Numeric asserts
// ---------------------------------------------------------------------------

export function near(actual: number, expected: number, tol = 0.5): void {
  expect(Math.abs(actual - expected), `${actual} should be within ${tol} of ${expected}`).toBeLessThanOrEqual(tol);
}
export function nearPt(actual: P, expected: P, tol = 0.5): void {
  near(actual.x, expected.x, tol);
  near(actual.y, expected.y, tol);
}
export function nearRect(actual: R | { x: number; y: number; width: number; height: number }, expected: R, tol = 0.5): void {
  near(actual.x, expected.x, tol);
  near(actual.y, expected.y, tol);
  near(actual.width, expected.width, tol);
  near(actual.height, expected.height, tol);
}
