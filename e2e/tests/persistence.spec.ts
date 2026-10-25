import {
  test,
  expect,
  TID,
  tidBoardRow,
  tidBoardOpen,
  tidBoardDelete,
  els,
  app,
  last,
  freshBoard,
  draw,
  drag,
  shot,
  flush,
  getBoard,
  waitReady,
  menu,
} from './helpers';
import type { Page } from '@playwright/test';

const status = (page: Page) => page.getByTestId(TID.saveStatus);
const boardParam = (page: Page) => new URL(page.url()).searchParams.get('board');
const editor = (page: Page) => page.getByTestId(TID.textEditor);

test('PER-1: autosave, then reload', async ({ page, request }) => {
  const id = await freshBoard(page, request);
  await draw(page, 'r', { x: 400, y: 250 }, { x: 560, y: 350 });
  await page.mouse.dblclick(700, 300);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type('Persist me');
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();
  await page.keyboard.press('a');
  await drag(page, { x: 480, y: 300 }, { x: 700, y: 500 });

  expect(['dirty', 'saving']).toContain(await status(page).getAttribute('data-status'));
  await expect(status(page)).toHaveAttribute('data-status', 'saved', { timeout: 15_000 });
  await expect(status(page)).toContainText('Saved');

  const before = await els(page);
  expect(before).toHaveLength(3);
  const v = (await app(page)).boardVersion;
  expect(v).toBeGreaterThanOrEqual(2);

  await page.reload();
  await waitReady(page);
  expect(boardParam(page)).toBe(id);
  const after = await els(page);
  expect(after).toHaveLength(3);
  for (const b of before) {
    const a = after.find((e) => e.id === b.id);
    expect(a, `element ${b.id} survives reload`).toBeDefined();
    if (b.type === 'text') {
      expect(a).toMatchObject({ text: b.text, x: b.x, y: b.y, autoResize: b.autoResize });
      expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
    } else {
      expect(a).toEqual(b);
    }
  }
  const a = await app(page);
  expect(a.canUndo).toBe(false);
  await expect(status(page)).toHaveAttribute('data-status', 'saved');

  const stored = await getBoard(request, id);
  expect(stored.scene.elements).toHaveLength(3);
  expect(stored.version).toBe(v);
  await shot(page, 'persistence-reload');
});

test('PER-2: Ctrl+S saves now', async ({ page, request }) => {
  const id = await freshBoard(page, request);
  await draw(page, 'r', { x: 400, y: 250 }, { x: 560, y: 350 });
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId(TID.toast)).toHaveText('Saved');
  await expect.poll(async () => (await getBoard(request, id)).scene.elements.length).toBe(1);
});

test('PER-3: the viewport is remembered per board', async ({ page, request }) => {
  const id = await freshBoard(page, request);
  await draw(page, 'r', { x: 400, y: 250 }, { x: 560, y: 350 });
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 150);
  await page.mouse.wheel(120, 0);
  await page.keyboard.press('Control+Equal');
  await expect.poll(async () => (await app(page)).viewport.zoom).toBeCloseTo(1.2, 9);
  const vp = (await app(page)).viewport;

  await expect
    .poll(
      () =>
        page.evaluate((key) => {
          try {
            return JSON.parse(localStorage.getItem(key) ?? 'null');
          } catch {
            return null;
          }
        }, `chalk:viewport:${id}`),
      { timeout: 10_000 },
    )
    .toEqual(vp);

  await page.reload();
  await waitReady(page);
  const re = (await app(page)).viewport;
  expect(Math.abs(re.scrollX - vp.scrollX)).toBeLessThan(1e-9);
  expect(Math.abs(re.scrollY - vp.scrollY)).toBeLessThan(1e-9);
  expect(Math.abs(re.zoom - vp.zoom)).toBeLessThan(1e-9);

  await menu(page, TID.menuNewBoard);
  await expect.poll(() => boardParam(page)).not.toBe(id);
  await expect.poll(async () => (await app(page)).boardId).toBe(boardParam(page));
  await expect.poll(async () => (await app(page)).viewport).toEqual({ scrollX: 0, scrollY: 0, zoom: 1 });
});

test('PER-4: rename the board', async ({ page, request }) => {
  const id = await freshBoard(page, request);
  const name = page.getByTestId(TID.boardName);
  await name.fill('Roadmap');
  await name.press('Enter');
  await expect(name).not.toBeFocused();
  expect((await app(page)).boardName).toBe('Roadmap');
  await expect.poll(async () => (await getBoard(request, id)).name).toBe('Roadmap');

  await page.reload();
  await waitReady(page);
  await expect(name).toHaveValue('Roadmap');

  await name.fill('Temp');
  await name.press('Escape');
  await expect(name).toHaveValue('Roadmap');

  await name.fill('   ');
  await name.press('Enter');
  expect((await app(page)).boardName).toBe('Roadmap');
  await name.blur();
});

test('PER-5: multiple boards: new, list, open, delete', async ({ page, request }) => {
  const id1 = await freshBoard(page, request, 'First');
  await draw(page, 'r', { x: 400, y: 250 }, { x: 560, y: 350 });

  await menu(page, TID.menuNewBoard);
  await expect.poll(() => boardParam(page)).not.toBe(id1);
  const id2 = boardParam(page)!;
  await expect.poll(async () => (await app(page)).boardId).toBe(id2);
  expect(await els(page)).toEqual([]);
  await expect(page.getByTestId(TID.welcomeHint)).toBeVisible();
  await expect(page.getByTestId(TID.boardName)).toHaveValue('Untitled board');
  expect((await getBoard(request, id1)).scene.elements).toHaveLength(1);

  await menu(page, TID.menuOpenBoards);
  await expect(page.getByTestId(TID.boardList)).toBeVisible();
  await expect(page.getByTestId(tidBoardRow(id1))).toBeVisible();
  await expect(page.getByTestId(tidBoardRow(id2))).toBeVisible();

  await page.getByTestId(tidBoardOpen(id1)).click();
  await expect(page.getByTestId(TID.boardList)).toBeHidden();
  await expect.poll(() => boardParam(page)).toBe(id1);
  await expect.poll(async () => (await els(page)).length).toBe(1);

  await menu(page, TID.menuOpenBoards);
  const del = page.getByTestId(tidBoardDelete(id2));
  await del.click();
  await expect(del).toHaveText('Confirm');
  await del.click();
  await expect(page.getByTestId(tidBoardRow(id2))).toHaveCount(0);
  expect((await request.get(`/api/boards/${id2}`)).status()).toBe(404);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId(TID.boardList)).toBeHidden();

  await menu(page, TID.menuOpenBoards);
  await page.getByTestId(TID.boardListNew).click();
  await expect(page.getByTestId(TID.boardList)).toBeHidden();
  await expect.poll(() => boardParam(page)).not.toBe(id1);
  await expect.poll(async () => (await app(page)).boardId).toBe(boardParam(page));
  expect(await els(page)).toEqual([]);
});

/** Shared start of PER-6 / PER-7: a saved board that is then changed behind the page's back. */
async function makeConflict(page: Page, request: any): Promise<{ id: string; v: number }> {
  const id = await freshBoard(page, request, 'Conflict A');
  await draw(page, 'r', { x: 400, y: 250 }, { x: 560, y: 350 });
  expect(await flush(page)).toBe('ok');
  const v = (await app(page)).boardVersion as number;

  const res = await request.put(`/api/boards/${id}`, { data: { name: 'Edited elsewhere', baseVersion: v } });
  expect(res.status()).toBe(200);
  expect((await res.json()).version).toBe(v + 1);

  await draw(page, 'r', { x: 700, y: 250 }, { x: 860, y: 350 });
  await expect.poll(async () => (await app(page)).saveStatus, { timeout: 15_000 }).toBe('conflict');
  await expect(page.getByTestId(TID.conflictBanner)).toBeVisible();
  await expect(page.getByTestId(TID.conflictBanner)).toContainText('This board was changed somewhere else.');
  await expect(status(page)).toContainText('Conflict');
  return { id, v };
}

test('PER-6: 409 conflict, Keep mine', async ({ page, request }) => {
  const { id, v } = await makeConflict(page, request);
  await shot(page, 'conflict');

  await draw(page, 'r', { x: 400, y: 450 }, { x: 560, y: 550 });
  expect(await flush(page)).toContain('conflict');
  expect((await getBoard(request, id)).version).toBe(v + 1);

  await page.getByTestId(TID.conflictOverwrite).click();
  await expect.poll(async () => (await app(page)).saveStatus, { timeout: 15_000 }).toBe('saved');
  await expect(page.getByTestId(TID.conflictBanner)).toBeHidden();
  const b = await getBoard(request, id);
  expect(b.version).toBe(v + 2);
  expect(b.scene.elements).toHaveLength(3);
  expect(b.name).toBe('Conflict A');
});

test('PER-7: 409 conflict, Reload', async ({ page, request }) => {
  await makeConflict(page, request);
  await page.getByTestId(TID.conflictReload).click();
  await expect.poll(async () => (await app(page)).saveStatus, { timeout: 15_000 }).toBe('saved');
  expect(await els(page)).toHaveLength(1);
  await expect(page.getByTestId(TID.boardName)).toHaveValue('Edited elsewhere');
  await expect(page.getByTestId(TID.conflictBanner)).toBeHidden();
  expect((await app(page)).canUndo).toBe(false);
});

test('PER-8: offline: the local backup is restored after reload', async ({ page, request }) => {
  // Go "offline" for writes by failing every PUT inside the page. page.route() is not enough here: Chromium
  // sends the keepalive PUT that the app fires on pagehide (reload) outside request interception, so it
  // would reach the server and the backup would rightly be discarded as stale. Patching fetch models a real
  // offline network for both the autosave and the unload flush, and survives the reload via an init script.
  await page.addInitScript(() => {
    const real = window.fetch.bind(window);
    (window as any).__chalkOffline = true;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if ((window as any).__chalkOffline && (init?.method ?? 'GET').toUpperCase() === 'PUT') {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return real(input, init);
    };
  });
  const id = await freshBoard(page, request);
  await draw(page, 'r', { x: 400, y: 250 }, { x: 560, y: 350 });
  const rectId = (await last(page)).id;
  await expect(status(page)).toHaveAttribute('data-status', 'error', { timeout: 15_000 });
  await expect(status(page)).toContainText('Offline — retrying');
  const backup = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), `chalk:backup:${id}`);
  expect(backup).not.toBeNull();
  expect(backup.scene.elements).toHaveLength(1);

  await page.reload();
  await waitReady(page);
  await expect(page.getByTestId(TID.toast)).toHaveText('Restored unsaved changes from this browser');
  const all = await els(page);
  expect(all).toHaveLength(1);
  expect(all[0].id).toBe(rectId);

  await page.evaluate(() => {
    (window as any).__chalkOffline = false;
  });
  await expect.poll(async () => (await app(page)).saveStatus, { timeout: 20_000 }).toBe('saved');
  expect((await getBoard(request, id)).scene.elements).toHaveLength(1);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), `chalk:backup:${id}`), { timeout: 10_000 })
    .toBeNull();
});

test('PER-9: an unknown board id creates a new board', async ({ page }) => {
  await page.goto('/?board=missing00000');
  await expect(page.getByTestId(TID.toast)).toHaveText('Board not found — created a new one');
  await expect.poll(() => boardParam(page)).not.toBe('missing00000');
  await waitReady(page);
  expect(await els(page)).toEqual([]);
});

