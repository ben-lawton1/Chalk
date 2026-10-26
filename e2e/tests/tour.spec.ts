import {
  test,
  expect,
  TID,
  tidBg,
  tidFill,
  tidStroke,
  els,
  app,
  selected,
  last,
  newBoard,
  openBoard,
  tidPage,
  paletteDrag,
  drag,
  shot,
  nearRect,
} from './helpers';
import type { Page } from '@playwright/test';

const rectOf = (e: any) => ({ x: e.x, y: e.y, width: e.width, height: e.height });
const editor = (page: Page) => page.getByTestId(TID.textEditor);

async function label(page: Page, x: number, y: number, text: string): Promise<void> {
  await page.mouse.dblclick(x, y);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();
}

test('TOUR-1: a full user journey', async ({ page, request }) => {
  test.setTimeout(60_000);
  // The tour owns two notebooks; the sidebar screenshot hides whatever other specs left in the shared test library.
  const keep = ['Product', 'Personal'];
  await page.route('**/api/library', async (route) => {
    const res = await route.fetch();
    const tree = await res.json();
    tree.notebooks = tree.notebooks.filter((n: { name: string }) => keep.includes(n.name));
    tree.path = 'C:/Users/you/Documents/Chalk';
    await route.fulfill({ response: res, json: tree });
  });
  for (const name of ['Roadmap', 'Design ideas', 'Retro']) {
    await newBoard(request, { name, notebook: 'Product', section: 'Planning' });
  }
  await newBoard(request, { name: 'Reading list', notebook: 'Personal', section: 'Home' });
  const tour = await newBoard(request, { name: 'Chalk tour', notebook: 'Product', section: 'Planning' });
  await openBoard(page, tour.id);
  await expect(page.getByTestId(TID.welcomeHint)).toBeVisible();
  await shot(page, 'tour-01-empty');

  // Drop shapes from the palette
  await paletteDrag(page, 'rectangle', { x: 450, y: 300 });
  const R = await last(page);
  nearRect(rectOf(R), { x: 370, y: 250, width: 160, height: 100 });
  await paletteDrag(page, 'diamond', { x: 850, y: 300 });
  const D = await last(page);
  nearRect(rectOf(D), { x: 770, y: 240, width: 160, height: 120 });
  await paletteDrag(page, 'ellipse', { x: 650, y: 560 });
  const E = await last(page);
  nearRect(rectOf(E), { x: 570, y: 510, width: 160, height: 100 });
  await shot(page, 'tour-02-shapes');

  // Label them
  await label(page, 450, 300, 'Idea');
  await label(page, 850, 300, 'Go?');
  await label(page, 650, 560, 'Ship it');

  // Connect them
  await page.keyboard.press('a');
  await drag(page, { x: 450, y: 300 }, { x: 850, y: 300 });
  await page.keyboard.press('a');
  await drag(page, { x: 850, y: 300 }, { x: 650, y: 560 });

  // A free text note
  await label(page, 450, 660, 'Chalk - the future of whiteboarding');

  // Style them
  await page.mouse.click(650, 560);
  expect(await selected(page)).toEqual([E.id]);
  await page.getByTestId(tidBg(2)).click();
  await page.getByTestId(tidFill('solid')).click();
  await page.mouse.click(450, 300);
  expect(await selected(page)).toEqual([R.id]);
  await page.getByTestId(tidBg(4)).click();
  await page.mouse.click(850, 300);
  expect(await selected(page)).toEqual([D.id]);
  await page.getByTestId(tidStroke(3)).click();

  // The editor must line up with the label: it is drawn once, not doubled
  await page.mouse.dblclick(450, 300);
  await expect(editor(page)).toBeFocused();
  await expect(editor(page)).toHaveAttribute('data-editing-id', R.id);
  await shot(page, 'tour-03-editing');
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();

  await page.mouse.click(1000, 680);
  expect(await selected(page)).toEqual([]);
  // wait for the autosave so the README screenshot shows the "Saved" pill
  await expect.poll(async () => (await app(page)).saveStatus, { timeout: 15_000 }).toBe('saved');
  await shot(page, 'tour-04-connected');

  // README screenshot: the same board with the sidebar open
  await page.getByTestId(TID.sidebarToggle).click();
  await expect(page.getByTestId(tidPage(tour.id))).toHaveAttribute('data-current', 'true');
  await expect.poll(async () => (await page.getByTestId(TID.canvasInteractive).boundingBox())?.x).toBe(264);
  await page.mouse.move(1200, 760);
  await shot(page, 'tour');

  const all = await els(page);
  const shapes = all.filter((e) => e.type === 'shape');
  expect(shapes.map((e) => e.label)).toEqual(['Idea', 'Go?', 'Ship it']);
  const arrows = all.filter((e) => e.type === 'arrow');
  expect(arrows).toHaveLength(2);
  expect(arrows[0].startBinding.elementId).toBe(R.id);
  expect(arrows[0].endBinding.elementId).toBe(D.id);
  expect(arrows[1].startBinding.elementId).toBe(D.id);
  expect(arrows[1].endBinding.elementId).toBe(E.id);
  expect(all.filter((e) => e.type === 'text')).toHaveLength(1);
});
