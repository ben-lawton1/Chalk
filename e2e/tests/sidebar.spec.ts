import {
  test,
  expect,
  TID,
  tidNotebook,
  tidSection,
  tidPage,
  tidRowMenu,
  tidRowRename,
  tidRowDelete,
  tidRowAdd,
  els,
  app,
  newBoard,
  getBoard,
  openBoard,
  freshBoard,
  draw,
  rectEl,
  scene,
  screenBounds,
  toScreen,
  toWorld,
  withSidebar,
  shot,
  near,
  nearPt,
} from './helpers';
import type { APIRequestContext, Page } from '@playwright/test';

const uid = (): string => Math.random().toString(36).slice(2, 8);
const boardParam = (page: Page) => new URL(page.url()).searchParams.get('board');
const renameInput = (page: Page) => page.getByTestId(TID.renameInput);

/** A fresh notebook/section holding the given pages (created through the API so the sidebar test owns its tree). */
async function seedSection(
  request: APIRequestContext,
  pages: Array<{ name: string; elements?: object[] }>,
): Promise<{ notebook: string; section: string; ids: string[] }> {
  const notebook = `SB ${uid()}`;
  const section = `Sec ${uid()}`;
  const ids: string[] = [];
  for (const p of pages) {
    const b = await newBoard(request, { name: p.name, scene: scene(p.elements ?? []), notebook, section });
    ids.push(b.id);
  }
  return { notebook, section, ids };
}

async function hoverAndClick(page: Page, rowTid: string, buttonTid: string): Promise<void> {
  await page.getByTestId(rowTid).hover();
  await page.getByTestId(buttonTid).click();
}

test('SB-1: create a notebook, a section and a page through the UI', async ({ page, request }) => {
  await withSidebar(page);
  await freshBoard(page, request, 'SB base');
  const sidebar = page.getByTestId(TID.sidebar);
  await expect(sidebar).toHaveAttribute('data-open', 'true');

  const nb = `Notebook ${uid()}`;
  await page.getByTestId(TID.sidebarNewNotebook).click();
  await expect(renameInput(page)).toBeFocused();
  await renameInput(page).fill(nb);
  await renameInput(page).press('Enter');
  await expect(page.getByTestId(tidNotebook(nb))).toBeVisible();
  // The new notebook's first page is open, and the server agrees where it lives
  await expect.poll(async () => (await getBoard(request, (await app(page)).boardId)).notebook).toBe(nb);

  await hoverAndClick(page, tidNotebook(nb), tidRowAdd(`nb:${nb}`));
  await expect(renameInput(page)).toBeFocused();
  await renameInput(page).fill('Alpha');
  await renameInput(page).press('Enter');
  await expect(page.getByTestId(tidSection(nb, 'Alpha'))).toBeVisible();
  await expect
    .poll(async () => {
      const b = await getBoard(request, (await app(page)).boardId);
      return `${b.notebook}/${b.section}`;
    })
    .toBe(`${nb}/Alpha`);

  await hoverAndClick(page, tidSection(nb, 'Alpha'), tidRowAdd(`sec:${nb}/Alpha`));
  const newId = await page.evaluate(() => (window as any).__CHALK__.getAppState().boardId);
  await expect(renameInput(page)).toBeFocused();
  await renameInput(page).fill('Page One');
  await renameInput(page).press('Enter');
  await expect(page.getByTestId(TID.boardName)).toHaveValue('Page One');
  await expect.poll(async () => (await getBoard(request, newId)).name).toBe('Page One');
  await expect(page.getByTestId(tidPage(newId))).toHaveAttribute('data-current', 'true');
  await expect(page.getByTestId(tidPage(newId))).toContainText('Page One');
  await expect(page.getByTestId(TID.sidebarPath)).not.toBeEmpty();
});

test('SB-2: switching pages swaps the elements and updates the URL', async ({ page, request }) => {
  const { ids } = await seedSection(request, [
    { name: 'One', elements: [rectEl('a1', 100, 100, 120, 80)] },
    { name: 'Two', elements: [rectEl('b1', 100, 100, 120, 80), rectEl('b2', 300, 100, 120, 80)] },
  ]);
  await withSidebar(page);
  await openBoard(page, ids[0]!, { identityViewport: true });
  await expect(page.getByTestId(tidPage(ids[0]!))).toHaveAttribute('data-current', 'true');
  expect((await els(page)).map((e) => e.id)).toEqual(['a1']);

  await page.getByTestId(tidPage(ids[1]!)).click();
  await expect.poll(() => boardParam(page)).toBe(ids[1]);
  await expect.poll(async () => (await els(page)).map((e) => e.id)).toEqual(['b1', 'b2']);
  await expect(page.getByTestId(tidPage(ids[1]!))).toHaveAttribute('data-current', 'true');
  await expect(page.getByTestId(tidPage(ids[0]!))).not.toHaveAttribute('data-current', 'true');
  await expect(page.getByTestId(TID.boardName)).toHaveValue('Two');

  await page.getByTestId(tidPage(ids[0]!)).click();
  await expect.poll(() => boardParam(page)).toBe(ids[0]);
  await expect.poll(async () => (await els(page)).map((e) => e.id)).toEqual(['a1']);
});

test('SB-3: rename a page from the row menu and by double-click', async ({ page, request }) => {
  const { ids, notebook, section } = await seedSection(request, [{ name: 'Old name' }, { name: 'Other' }]);
  await withSidebar(page);
  await openBoard(page, ids[0]!, { identityViewport: true });

  const key = `page:${ids[0]}`;
  await hoverAndClick(page, tidPage(ids[0]!), tidRowMenu(key));
  await page.getByTestId(tidRowRename(key)).click();
  await expect(renameInput(page)).toBeFocused();
  await renameInput(page).fill('Escape me');
  await renameInput(page).press('Escape');
  await expect(page.getByTestId(tidPage(ids[0]!))).toContainText('Old name');

  await hoverAndClick(page, tidPage(ids[0]!), tidRowMenu(key));
  await page.getByTestId(tidRowRename(key)).click();
  await renameInput(page).fill('New name');
  await renameInput(page).press('Enter');
  await expect(page.getByTestId(TID.boardName)).toHaveValue('New name');
  await expect(page.getByTestId(tidPage(ids[0]!))).toContainText('New name');
  await expect.poll(async () => (await getBoard(request, ids[0]!)).name).toBe('New name');

  // A page that is not open is renamed directly on the server
  const key1 = `page:${ids[1]}`;
  await hoverAndClick(page, tidPage(ids[1]!), tidRowMenu(key1));
  await page.getByTestId(tidRowRename(key1)).click();
  await expect(renameInput(page)).toBeFocused();
  await renameInput(page).fill('Other renamed');
  await renameInput(page).press('Enter');
  await expect(page.getByTestId(tidPage(ids[1]!))).toContainText('Other renamed');
  await expect.poll(async () => (await getBoard(request, ids[1]!)).name).toBe('Other renamed');

  // Double-click opens the page and renames it; a colliding name is adopted as the server returned it
  await page.getByTestId(tidPage(ids[1]!)).dblclick();
  await expect(renameInput(page)).toBeFocused();
  await renameInput(page).fill('New name');
  await renameInput(page).press('Enter');
  await expect(page.getByTestId(tidPage(ids[1]!))).toContainText('New name (2)');
  expect((await getBoard(request, ids[1]!)).name).toBe('New name (2)');

  // Renaming the section keeps the open page in it and updates its location
  const skey = `sec:${notebook}/${section}`;
  await hoverAndClick(page, tidSection(notebook, section), tidRowMenu(skey));
  await page.getByTestId(tidRowRename(skey)).click();
  await renameInput(page).fill('Renamed section');
  await renameInput(page).press('Enter');
  await expect(page.getByTestId(tidSection(notebook, 'Renamed section'))).toBeVisible();
  await expect.poll(async () => (await getBoard(request, ids[0]!)).section).toBe('Renamed section');
  await expect(page.getByTestId(tidPage(ids[1]!))).toHaveAttribute('data-current', 'true');
  expect((await getBoard(request, ids[1]!)).section).toBe('Renamed section');
});

test('SB-4: delete a page with the two-click confirm', async ({ page, request }) => {
  const { ids } = await seedSection(request, [{ name: 'Keep' }, { name: 'Doomed' }]);
  await withSidebar(page);
  await openBoard(page, ids[0]!, { identityViewport: true });

  const key = `page:${ids[1]}`;
  await hoverAndClick(page, tidPage(ids[1]!), tidRowMenu(key));
  const del = page.getByTestId(tidRowDelete(key));
  await expect(del).toHaveText('Delete');
  await del.click();
  await expect(del).toHaveText('Confirm');
  expect((await request.get(`/api/boards/${ids[1]}`)).status()).toBe(200); // one click deletes nothing
  await del.click();
  await expect(page.getByTestId(tidPage(ids[1]!))).toHaveCount(0);
  expect((await request.get(`/api/boards/${ids[1]}`)).status()).toBe(404);
  expect(boardParam(page)).toBe(ids[0]);

  // Deleting the open page opens another one
  const key0 = `page:${ids[0]}`;
  await hoverAndClick(page, tidPage(ids[0]!), tidRowMenu(key0));
  await page.getByTestId(tidRowDelete(key0)).click();
  await page.getByTestId(tidRowDelete(key0)).click();
  await expect.poll(() => boardParam(page)).not.toBe(ids[0]);
  await expect.poll(async () => (await app(page)).boardId).toBe(boardParam(page));
  await expect(page.getByTestId(tidPage(ids[0]!))).toHaveCount(0);
});

test('SB-5: with the sidebar open a client point maps to the right world point', async ({ page, request }) => {
  const { ids } = await seedSection(request, [{ name: 'Offset' }]);
  await withSidebar(page);
  await openBoard(page, ids[0]!, { identityViewport: true });
  const box = await page.getByTestId(TID.canvasInteractive).boundingBox();
  expect(box?.x).toBe(264);

  await draw(page, 'r', { x: 500, y: 300 }, { x: 660, y: 400 });
  const all = await els(page);
  expect(all).toHaveLength(1);
  near(all[0].x, 500 - 264, 1);
  near(all[0].y, 300, 1);
  near(all[0].width, 160, 1);

  nearPt(await toScreen(page, { x: all[0].x, y: all[0].y }), { x: 500, y: 300 }, 0.5);
  nearPt(await toWorld(page, { x: 500, y: 300 }), { x: all[0].x, y: all[0].y }, 0.5);
  const b = await screenBounds(page, all[0].id);
  near(b!.x, 500, 0.5);
  near(b!.y, 300, 0.5);

  // Clicking the shape where it is drawn selects it
  await page.keyboard.press('v');
  await page.mouse.click(580, 350);
  expect(await page.evaluate(() => (window as any).__CHALK__.getSelectedIds())).toEqual([all[0].id]);
});

test('SB-6: collapse and expand persist across a reload', async ({ page, request }) => {
  const { ids } = await seedSection(request, [{ name: 'Persist' }]);
  await withSidebar(page);
  await openBoard(page, ids[0]!, { identityViewport: true });
  const sidebar = page.getByTestId(TID.sidebar);
  await expect(sidebar).toBeVisible();
  await expect(page.getByTestId(TID.sidebarToggle)).toHaveCount(0);

  await page.getByTestId(TID.sidebarCollapse).click();
  await expect(sidebar).toHaveAttribute('data-open', 'false');
  await expect(sidebar).toBeHidden();
  await expect(page.getByTestId(TID.sidebarToggle)).toBeVisible();
  await expect.poll(async () => (await page.getByTestId(TID.canvasInteractive).boundingBox())?.x).toBe(0);

  await page.reload();
  await expect(page.getByTestId(TID.sidebarToggle)).toBeVisible();
  await expect(sidebar).toHaveAttribute('data-open', 'false');

  await page.getByTestId(TID.sidebarToggle).click();
  await expect(sidebar).toBeVisible();
  await expect.poll(async () => (await page.getByTestId(TID.canvasInteractive).boundingBox())?.x).toBe(264);
  await page.reload();
  await expect(sidebar).toHaveAttribute('data-open', 'true');
  await expect(page.getByTestId(tidPage(ids[0]!))).toBeVisible();

  // Ctrl+\ toggles as well
  await page.keyboard.press('Control+Backslash');
  await expect(sidebar).toHaveAttribute('data-open', 'false');
  await page.keyboard.press('Control+Backslash');
  await expect(sidebar).toHaveAttribute('data-open', 'true');
});

test('SB-7: keyboard navigation and a populated, long-named tree (screenshot)', async ({ page, request }) => {
  const long = 'A very long page title that certainly cannot fit into the sidebar width';
  const a = await seedSection(request, [
    { name: 'Roadmap' },
    { name: 'Ideas' },
    { name: long },
    { name: 'Meeting notes 2026-10-25' },
  ]);
  // A second section and a second notebook make the tree look like real use
  await newBoard(request, { name: 'Standup', notebook: a.notebook, section: 'Meetings' });
  await newBoard(request, { name: 'Groceries', notebook: 'Personal', section: 'Lists' });
  await withSidebar(page);
  await openBoard(page, a.ids[0]!, { identityViewport: true });
  await expect(page.getByTestId(tidPage(a.ids[2]!))).toBeVisible();

  // Roving focus: the current page is the tab stop; arrows move between rows
  const current = page.getByTestId(tidPage(a.ids[0]!)).locator('[data-rowmain]');
  await current.focus();
  // (pages are sorted by name: long title, Ideas, Meeting notes, Roadmap)
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId(tidPage(a.ids[3]!)).locator('[data-rowmain]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(current).toBeFocused();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId(tidSection(a.notebook, a.section)).locator('[data-rowmain]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId(tidPage(a.ids[0]!))).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId(tidPage(a.ids[0]!))).toBeVisible();
  await page.keyboard.press('F2');
  await expect(renameInput(page)).toBeFocused();
  await renameInput(page).press('Escape');

  await page.getByTestId(tidPage(a.ids[1]!)).hover();
  await shot(page, 'sidebar');
});
