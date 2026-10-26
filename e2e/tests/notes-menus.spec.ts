import { test, expect, TID, tidSlashItem, tidTableAction, tidPageItem, app, newBoard, openBoard, freshBoard, shot } from './helpers';
import type { Page } from '@playwright/test';

// Quick checks for the slash menu, /table, the table toolbar and @ page links (N-C). The full notes spec is notes.spec.ts.
const notesText = (page: Page): Promise<string> => page.evaluate(() => (window as any).__CHALK__.getNotesText());
const notesDoc = (page: Page): Promise<any> => page.evaluate(() => (window as any).__CHALK__.getNotes());
const active = async (page: Page): Promise<boolean> => (await app(page)).notesActive;
const editorEl = (page: Page) => page.getByTestId(TID.notesEditor);
const blocks = async (page: Page): Promise<any[]> => {
  const c: any[] = [...((await notesDoc(page))?.doc?.content ?? [])];
  while (c.length > 1 && c[c.length - 1].type === 'paragraph' && !c[c.length - 1].content) c.pop(); // the trailing empty paragraph
  return c;
};

async function enter(page: Page): Promise<void> {
  await page.getByTestId(TID.toolNotes).click();
  await expect(editorEl(page)).toBeFocused();
}
let uid = 0;
const unique = (base: string): string => `${base}${Date.now().toString(36)}${uid++}`;

test('slash menu: filter, pick, Esc keeps the text, a second Esc leaves notes mode', async ({ page, request }) => {
  await freshBoard(page, request);
  await enter(page);
  await page.keyboard.type('/');
  await expect(page.getByTestId(TID.slashMenu)).toBeVisible();
  await expect(page.getByTestId(tidSlashItem('text'))).toBeVisible();
  await shot(page, 'notes-slash-menu');
  await page.keyboard.type('h2');
  await expect(page.getByTestId(tidSlashItem('h2'))).toBeVisible();
  await expect(page.getByTestId(tidSlashItem('h1'))).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId(TID.slashMenu)).toBeHidden();
  await page.keyboard.type('Title');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await blocks(page))[0]?.attrs?.level).toBe(2);

  // Arrow keys and mouse hover/click.
  await page.keyboard.type('/bul');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter'); // first match for "bul" is Bulleted list
  await page.keyboard.type('item');
  await expect.poll(async () => (await blocks(page)).map((b) => b.type)).toEqual(['heading', 'bulletList']);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/quo');
  await page.getByTestId(tidSlashItem('quote')).click();
  await expect.poll(async () => (await blocks(page)).map((b) => b.type)).toEqual(['heading', 'bulletList', 'blockquote']);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');

  // Esc closes the menu and leaves the typed text; a second Esc leaves notes mode.
  await page.keyboard.type('/co');
  await expect(page.getByTestId(TID.slashMenu)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId(TID.slashMenu)).toBeHidden();
  expect(await active(page)).toBe(true);
  await expect.poll(() => notesText(page)).toContain('/co');
  await page.keyboard.press('Escape');
  await expect.poll(() => active(page)).toBe(false);
});

test('slash menu: no results, then it closes; /code, /inline, /callout', async ({ page, request }) => {
  await freshBoard(page, request);
  await enter(page);
  await page.keyboard.type('/zq');
  await expect(page.getByTestId(TID.slashEmpty)).toBeVisible();
  await page.keyboard.type('x');
  await expect(page.getByTestId(TID.slashMenu)).toBeHidden();
  await expect.poll(() => notesText(page)).toBe('/zqx');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');

  await page.keyboard.type('/code');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await blocks(page)).map((b) => b.type)).toEqual(['codeBlock']);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Control+Alt+0'); // back to a paragraph
  await page.keyboard.type('before ');
  await page.keyboard.type('/inline');
  await page.keyboard.press('Enter');
  await page.keyboard.type('mono`');
  await page.keyboard.type(' plain');
  await expect.poll(async () => JSON.stringify((await blocks(page))[0]?.content ?? [])).toContain('"code"');
  const para = (await blocks(page))[0];
  const marked = para.content.filter((n: any) => n.marks?.some((m: any) => m.type === 'code')).map((n: any) => n.text).join('');
  expect(marked).toBe('mono');
  expect(await notesText(page)).toBe('before mono plain');
});

test('/table size step builds a header table; Tab walks the cells and adds a row; the toolbar edits it', async ({ page, request }) => {
  await freshBoard(page, request);
  await enter(page);
  await page.keyboard.type('/table');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId(TID.tableStep)).toBeVisible();
  await expect(page.getByTestId(TID.tableRows)).toBeFocused();
  await page.keyboard.type('4');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId(TID.tableCols)).toBeFocused();
  await page.keyboard.type('5');
  await expect(page.getByTestId(TID.tablePreview)).toHaveAttribute('data-rows', '4');
  await expect(page.getByTestId(TID.tablePreview)).toHaveAttribute('data-cols', '5');
  await shot(page, 'notes-table-step');
  // Clamping: a huge number becomes the maximum.
  await page.getByTestId(TID.tableCols).fill('99');
  await expect(page.getByTestId(TID.tableCols)).toHaveValue('12');
  await page.getByTestId(TID.tableCols).fill('5');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId(TID.slashMenu)).toBeHidden();
  const table = (await blocks(page)).find((b) => b.type === 'table');
  expect(table.content.length).toBe(4);
  expect(table.content[0].content.length).toBe(5);
  expect(table.content[0].content[0].type).toBe('tableHeader');
  expect(table.content[1].content[0].type).toBe('tableCell');

  // Typing goes into the first cell; Tab moves on.
  await page.keyboard.type('a');
  await page.keyboard.press('Tab');
  await page.keyboard.type('b');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.type('!');
  await expect.poll(async () => (await blocks(page)).find((b) => b.type === 'table').content[0].content[0].content[0].content[0].text).toBe('!'); // Shift+Tab selects the previous cell's text, so typing replaces it
  await expect(page.getByTestId(TID.tableToolbar)).toBeVisible();
  await shot(page, 'notes-table-toolbar');
  await page.getByTestId(tidTableAction('row-below')).click();
  await expect.poll(async () => (await blocks(page)).find((b) => b.type === 'table').content.length).toBe(5);
  await page.getByTestId(tidTableAction('col-right')).click();
  await expect.poll(async () => (await blocks(page)).find((b) => b.type === 'table').content[0].content.length).toBe(6);
  await page.getByTestId(tidTableAction('delete-row')).click();
  await page.getByTestId(tidTableAction('delete-col')).click();
  await expect.poll(async () => (await blocks(page)).find((b) => b.type === 'table').content.length).toBe(4);
  await page.getByTestId(tidTableAction('delete-table')).click();
  await expect.poll(async () => (await blocks(page)).some((b) => b.type === 'table')).toBe(false);
  await expect(page.getByTestId(TID.tableToolbar)).toBeHidden();
});

test('/table 2x3 and /table 2 3 insert directly; Tab at the last cell adds a row', async ({ page, request }) => {
  await freshBoard(page, request);
  await enter(page);
  await page.keyboard.type('/table 2x3');
  await expect(page.getByTestId(tidSlashItem('table'))).toBeVisible();
  await page.keyboard.press('Enter');
  let table = (await blocks(page)).find((b) => b.type === 'table');
  expect(table.content.length).toBe(2);
  expect(table.content[0].content.length).toBe(3);
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab'); // 5 moves reach the last cell, the 6th adds a row
  await expect.poll(async () => (await blocks(page)).find((b) => b.type === 'table').content.length).toBe(3);
  // A second table, with the space form, below the first (arrow out of the table first).
  await page.keyboard.press('Control+End');
  await page.keyboard.type('/table 1 2');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await blocks(page)).filter((b) => b.type === 'table').length).toBe(2);
  table = (await blocks(page)).filter((b) => b.type === 'table')[1];
  expect(table.content.length).toBe(1);
  expect(table.content[0].content.length).toBe(2);
});

test('>> inside a task item does not wrap it in a toggle', async ({ page, request }) => {
  await freshBoard(page, request);
  await enter(page);
  await page.keyboard.type('[] ');
  await page.keyboard.type('>> x');
  await expect.poll(() => notesText(page)).toMatch(/^>> x/);
  const b = await blocks(page);
  expect(b.map((n: any) => n.type)).toEqual(['taskList']);
  // At the top level the rule still works.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('>> ');
  await expect.poll(async () => (await blocks(page)).map((n: any) => n.type)).toContain('details');
});

test('the welcome hint goes away once there are notes', async ({ page, request }) => {
  await freshBoard(page, request);
  await expect(page.getByTestId(TID.welcomeHint)).toBeVisible();
  await expect(page.getByTestId(TID.welcomeHint)).toContainText('Press N to take notes.');
  await enter(page);
  await expect(page.getByTestId(TID.welcomeHint)).toBeHidden();
  await page.keyboard.type('hi');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId(TID.welcomeHint)).toBeHidden();
});

test('@ links pages: ranking, chip, click opens, new page, /newpage, missing page', async ({ page, request }) => {
  const nb = unique('NB');
  const here = await newBoard(request, { name: 'Here', notebook: nb, section: 'S1' });
  const sameSection = await newBoard(request, { name: 'Zeta same section', notebook: nb, section: 'S1' });
  const otherSection = await newBoard(request, { name: 'Alpha other section', notebook: nb, section: 'S2' });
  await openBoard(page, here.id);
  await enter(page);
  await page.keyboard.type('See @');
  await expect(page.getByTestId(TID.pageMenu)).toBeVisible();
  await expect(page.getByTestId(tidPageItem(sameSection.id))).toBeVisible();
  await expect(page.getByTestId(tidPageItem(otherSection.id))).toBeVisible();
  await expect(page.getByTestId(tidPageItem(here.id))).toHaveCount(0); // the current page is excluded
  // Current section first, even though "Alpha" sorts before "Zeta".
  const rows = await page.getByTestId(TID.pageMenu).locator('[data-testid^="page-item-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(rows.indexOf(`page-item-${sameSection.id}`)).toBeLessThan(rows.indexOf(`page-item-${otherSection.id}`));
  await shot(page, 'notes-page-menu');
  await page.keyboard.type('alpha');
  await expect(page.getByTestId(tidPageItem(sameSection.id))).toBeHidden();
  await page.keyboard.press('Enter');
  const chip = page.getByTestId(TID.pageLink);
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveText('Alpha other section');
  await expect(chip).toHaveAttribute('data-missing', 'false');
  await expect.poll(() => notesText(page)).toBe('See Alpha other section ');
  await shot(page, 'notes-page-chip');

  // [[ opens the same picker; /page too.
  await page.keyboard.type('[[zeta');
  await expect(page.getByTestId(tidPageItem(sameSection.id))).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId(TID.pageLink)).toHaveCount(2);
  await page.keyboard.type('/page');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId(TID.pageMenu)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId(TID.pageMenu)).toBeHidden();

  // New page "<query>": created in this section, not opened, linked.
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' @Brand new');
  await expect(page.getByTestId(TID.pageMenuNew)).toContainText('Brand new');
  await page.getByTestId(TID.pageMenuNew).click();
  await expect(page.getByTestId(TID.pageLink)).toHaveCount(3);
  expect((await app(page)).boardId).toBe(here.id);
  const list = await (await request.get('/api/boards')).json();
  const created = list.find((b: any) => b.name === 'Brand new');
  expect(created).toBeTruthy();
  expect(created.notebook).toBe(nb);
  expect(created.section).toBe('S1');

  // /newpage creates an untitled page and links it.
  await page.keyboard.type(' /newpage');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId(TID.pageLink)).toHaveCount(4);
  expect((await app(page)).boardId).toBe(here.id);

  // Clicking a chip opens the page, in notes mode (here) ...
  await page.getByTestId(TID.pageLink).first().click();
  await expect.poll(async () => (await app(page)).boardId).toBe(otherSection.id);
  // ... and out of notes mode.
  await openBoard(page, here.id);
  expect(await active(page)).toBe(false);
  await page.getByTestId(TID.pageLink).first().click();
  await expect.poll(async () => (await app(page)).boardId).toBe(otherSection.id);
});

test('a link to a deleted page is struck through; a rename shows up in the chip', async ({ page, request }) => {
  const nb = unique('NB');
  const target = await newBoard(request, { name: 'Target', notebook: nb, section: 'S1' });
  const gone = await newBoard(request, { name: 'Gone', notebook: nb, section: 'S1' });
  const notes = {
    width: 760,
    doc: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [
        { type: 'pageLink', attrs: { id: target.id, label: 'Stale label' } },
        { type: 'text', text: ' and ' },
        { type: 'pageLink', attrs: { id: gone.id, label: 'Gone' } },
      ] }],
    },
  };
  const host = await newBoard(request, { name: 'Host', notebook: nb, section: 'S1', scene: { type: 'chalk/scene', version: 4, elements: [], notes } });
  expect((await request.delete(`/api/boards/${gone.id}`)).ok()).toBe(true);
  await openBoard(page, host.id);
  const chips = page.getByTestId(TID.pageLink);
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(0)).toHaveText('Target');
  await expect(chips.nth(0)).toHaveAttribute('data-missing', 'false');
  await expect(chips.nth(1)).toHaveAttribute('data-missing', 'true');
  await expect(chips.nth(1)).toHaveAttribute('title', 'Page not found');
  await shot(page, 'notes-page-missing');
  // The stored label is kept in the document.
  expect(JSON.stringify(await notesDoc(page))).toContain('Stale label');
});
