import { test, expect, TID, tidTool, app, shot, waitReady } from './helpers';

test('SMK-1: the app boots on / and the chrome is complete', async ({ page, request }) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: 'ok' });

  // Read-only: an empty DB lets initBoards POST a board, but nothing may be changed or removed.
  await page.route('**/api/boards/**', (r) =>
    ['PUT', 'DELETE'].includes(r.request().method()) ? r.abort() : r.continue(),
  );
  await page.goto('/');
  await waitReady(page);

  await expect(page).toHaveTitle('Chalk');
  await expect(page).toHaveURL(/\?board=[A-Za-z0-9_-]{6,64}$/);
  const a = await app(page);
  expect(new URL(page.url()).searchParams.get('board')).toBe(a.boardId);
  expect(a.viewportSize).toEqual({ width: 1280, height: 800 });
  await expect(page.getByTestId(TID.canvasStatic)).toHaveAttribute('width', '1280');
  await expect(page.getByTestId(TID.canvasStatic)).toHaveAttribute('height', '800');

  for (const id of [
    TID.canvasContainer,
    TID.canvasStatic,
    TID.canvasInteractive,
    ...['hand', 'select', 'rectangle', 'diamond', 'ellipse', 'triangle', 'arrow', 'line', 'text'].map(tidTool),
    TID.toolLock,
    TID.menuButton,
    TID.boardName,
    TID.saveStatus,
    TID.zoomOut,
    TID.zoomReset,
    TID.zoomIn,
    TID.zoomFit,
    TID.undo,
    TID.redo,
    TID.helpButton,
    TID.hintBar,
  ]) {
    await expect(page.getByTestId(id), id).toBeVisible();
  }
  await expect(page.getByTestId(tidTool('select'))).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(TID.toolLock)).toHaveAttribute('aria-pressed', 'false');

  // Help dialog
  await page.getByTestId(TID.helpButton).click();
  const help = page.getByTestId(TID.helpDialog);
  await expect(help).toBeVisible();
  await expect(help).toContainText('Ctrl + Z');
  await expect(help).toContainText('Zoom to fit everything');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await page.keyboard.press('Shift+Slash');
  await expect(help).toBeVisible();
  await page.getByTestId(TID.helpClose).click();
  await expect(help).toBeHidden();

  // Menu
  const items = [
    TID.menuNewBoard,
    TID.menuOpenBoards,
    TID.menuImport,
    TID.menuExportJson,
    TID.menuExportPng,
    TID.menuHelp,
  ];
  await page.getByTestId(TID.menuButton).click();
  for (const id of items) await expect(page.getByTestId(id), id).toBeVisible();
  await page.getByTestId(TID.menuButton).click();
  for (const id of items) await expect(page.getByTestId(id), id).toBeHidden();

  await shot(page, 'smoke');
});
