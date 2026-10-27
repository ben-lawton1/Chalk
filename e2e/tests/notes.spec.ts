import { test, expect, TID, tidPage, tidRowMenu, tidRowRename, tidSlashItem, app, newBoard, openBoard, freshBoard, flush, waitReady, withSidebar, shot } from './helpers';
import type { Page } from '@playwright/test';

// Notes e2e that fills the gaps left by notes-editor.spec.ts (editor, markdown, caret, pass-through, zoom) and notes-menus.spec.ts
// (slash menu, /table, @ links). Covered there, by plan item: basic text + reload, markdown shortcuts, /code /inline /h2, /table (size step,
// direct form, Tab), Esc twice, @ chip + click, pass-through + double-click, the N key caret, Ctrl+K, /newpage, the welcome hint, zoom to fit.
// Here: /url, rename-updates-chip, task checkbox across a reload, notes across a page switch, and the terminal panel next to the notes.
const notesText = (page: Page): Promise<string> => page.evaluate(() => (window as any).__CHALK__.getNotesText());
const notesDoc = (page: Page): Promise<any> => page.evaluate(() => (window as any).__CHALK__.getNotes());
const editorEl = (page: Page) => page.getByTestId(TID.notesEditor);
let uid = 0;
const unique = (base: string): string => `${base}${Date.now().toString(36)}${uid++}`;

async function enter(page: Page): Promise<void> {
  await page.getByTestId(TID.toolNotes).click();
  await expect(editorEl(page)).toBeFocused();
}
const topTypes = async (page: Page): Promise<string[]> => ((await notesDoc(page))?.doc?.content ?? []).map((n: any) => n.type);

test('NOTES-1: Ctrl+K and /url link text; the link is stored with its href', async ({ page, request }) => {
  await freshBoard(page, request);
  await enter(page);
  await page.keyboard.type('docs');
  await page.keyboard.press('Shift+Home');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('docs'); // ProseMirror reads the selection on selectionchange
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId(TID.notesLinkInput)).toBeVisible();
  await page.getByTestId(TID.notesLinkInput).fill('example.com/a');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId(TID.notesLinkInput)).toBeHidden();
  await expect(editorEl(page).locator('a[href="https://example.com/a"]')).toHaveText('docs');

  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/url');
  await expect(page.getByTestId(tidSlashItem('url'))).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId(TID.notesLinkInput)).toBeVisible();
  await page.getByTestId(TID.notesLinkInput).fill('https://example.org/b');
  await page.keyboard.press('Enter');
  await expect.poll(async () => JSON.stringify(await notesDoc(page))).toContain('https://example.org/b');
  expect(await notesText(page)).toContain('docs');
});

test('NOTES-2: renaming a linked page updates the chip', async ({ page, request }) => {
  const nb = unique('NB');
  const target = await newBoard(request, { name: 'Before', notebook: nb, section: 'S1' });
  const notes = {
    width: 760,
    doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'pageLink', attrs: { id: target.id, label: 'Before' } }] }] },
  };
  const host = await newBoard(request, { name: 'Host', notebook: nb, section: 'S1', scene: { type: 'chalk/scene', version: 4, elements: [], notes } });
  await withSidebar(page);
  await openBoard(page, host.id);
  const chip = page.getByTestId(TID.pageLink);
  await expect(chip).toHaveText('Before');
  const key = `page:${target.id}`;
  await page.getByTestId(tidPage(target.id)).hover();
  await page.getByTestId(tidRowMenu(key)).click();
  await page.getByTestId(tidRowRename(key)).click();
  await page.getByTestId(TID.renameInput).fill('After');
  await page.getByTestId(TID.renameInput).press('Enter');
  await expect(chip).toHaveText('After');
  await expect(chip).toHaveAttribute('data-missing', 'false');
});

test('NOTES-3: a checked task item survives a reload', async ({ page, request }) => {
  await freshBoard(page, request);
  await enter(page);
  await page.keyboard.type('[] buy chalk');
  await expect.poll(() => topTypes(page)).toContain('taskList');
  const box = editorEl(page).locator('ul[data-type="taskList"] input[type="checkbox"]');
  await expect(box).not.toBeChecked();
  await box.click();
  await expect(box).toBeChecked();
  await expect.poll(async () => JSON.stringify(await notesDoc(page))).toContain('"checked":true');
  await box.click();
  await expect(box).not.toBeChecked();
  await box.click();
  await expect(box).toBeChecked();
  expect(await flush(page)).toBe('ok');
  await page.reload();
  await waitReady(page);
  await expect(editorEl(page).locator('ul[data-type="taskList"] input[type="checkbox"]')).toBeChecked();
  await expect(editorEl(page).locator('li[data-checked="true"]')).toHaveCount(1);
});

test('NOTES-4: notes survive a page switch through the sidebar and coming back', async ({ page, request }) => {
  const nb = unique('NB');
  const a = await newBoard(request, { name: 'Page A', notebook: nb, section: 'S1' });
  const b = await newBoard(request, { name: 'Page B', notebook: nb, section: 'S1' });
  await withSidebar(page);
  await openBoard(page, a.id);
  await enter(page);
  await page.keyboard.type('only on A');
  await expect.poll(() => notesText(page)).toBe('only on A');
  await page.getByTestId(tidPage(b.id)).click();
  await expect.poll(async () => (await app(page)).boardId).toBe(b.id);
  await expect.poll(() => notesText(page)).toBe('');
  expect((await app(page)).notesActive).toBe(false);
  await enter(page);
  await page.keyboard.type('only on B');
  await expect.poll(() => notesText(page)).toBe('only on B');
  await page.getByTestId(tidPage(a.id)).click();
  await expect.poll(async () => (await app(page)).boardId).toBe(a.id);
  await expect.poll(() => notesText(page)).toBe('only on A');
  await expect(editorEl(page)).toContainText('only on A');
  await page.getByTestId(tidPage(b.id)).click();
  await expect.poll(() => notesText(page)).toBe('only on B');
});

test('NOTES-5: the terminal panel and the notes coexist; menus stay inside the stage, above the panel', async ({ page, request }) => {
  await freshBoard(page, request);
  await page.getByTestId(TID.terminalButton).click();
  await expect(page.getByTestId(TID.terminalPanel)).toBeVisible();
  await expect(page.getByTestId(TID.terminalTab).first()).toHaveAttribute('data-status', 'running', { timeout: 15_000 });
  await enter(page);
  for (let i = 0; i < 25; i++) {
    await page.keyboard.type(`line ${i}`);
    await page.keyboard.press('Enter');
  }
  await page.keyboard.type('/');
  const menu = page.getByTestId(TID.slashMenu);
  await expect(menu).toBeVisible();
  const panel = (await page.getByTestId(TID.terminalPanel).boundingBox())!;
  const stage = (await page.locator('.stage').boundingBox())!;
  const m = (await menu.boundingBox())!;
  expect(m.y + m.height).toBeLessThanOrEqual(panel.y + 1);
  expect(m.y + m.height).toBeLessThanOrEqual(stage.y + stage.height + 1);
  expect(m.y).toBeGreaterThanOrEqual(stage.y - 1);
  await shot(page, 'notes-with-terminal');
  await page.keyboard.type('h2');
  await page.keyboard.press('Enter');
  await page.keyboard.type('still typing');
  await expect.poll(async () => (await topTypes(page)).includes('heading')).toBe(true);
  // The page link menu is placed the same way.
  await page.keyboard.press('Enter');
  await page.keyboard.type('@');
  const pm = page.getByTestId(TID.pageMenu);
  await expect(pm).toBeVisible();
  const pb = (await pm.boundingBox())!;
  expect(pb.y + pb.height).toBeLessThanOrEqual(panel.y + 1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  expect((await app(page)).notesActive).toBe(false);
  await page.keyboard.press('Control+Backquote');
  await expect(page.getByTestId(TID.terminalPanel)).toBeHidden();
  await expect(editorEl(page)).toContainText('still typing');
});

test('NOTES-6: web links open on a plain click when notes mode is off, and on Ctrl+click in notes mode', async ({ page, request }) => {
  const mark = (href: string) => [{ type: 'link', attrs: { href } }];
  const notes = {
    width: 760,
    doc: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'docs', marks: mark('https://example.com/a') },
          { type: 'text', text: ' and ' },
          { type: 'text', text: 'bad', marks: mark('javascript:alert(1)') },
        ],
      }],
    },
  };
  const host = await newBoard(request, { name: 'Links', notebook: unique('NB'), section: 'S1', scene: { type: 'chalk/scene', version: 4, elements: [], notes } });
  await page.addInitScript(() => {
    (window as any).__opens = [];
    window.open = ((...args: unknown[]) => { (window as any).__opens.push(args); return null; }) as typeof window.open;
  });
  await withSidebar(page);
  await openBoard(page, host.id);
  const opens = (): Promise<unknown[][]> => page.evaluate(() => (window as any).__opens);
  const link = editorEl(page).locator('a[href="https://example.com/a"]');
  await expect(link).toHaveText('docs');
  await expect(editorEl(page).locator('a[href="javascript:alert(1)"]')).toHaveCount(0); // Tiptap blanks it when rendering

  // Notes mode off: a plain click opens the link and does not enter notes mode.
  await link.hover();
  await expect(link).toHaveAttribute('title', 'https://example.com/a');
  await link.click();
  await expect.poll(opens).toEqual([['https://example.com/a', '_blank', 'noopener,noreferrer']]);
  expect((await app(page)).notesActive).toBe(false);

  // Notes mode on: a plain click edits (no open); Ctrl+click opens.
  await enter(page);
  await link.hover();
  await expect(link).toHaveAttribute('title', /Ctrl\+click to open/);
  await link.click();
  expect((await app(page)).notesActive).toBe(true);
  expect(await opens()).toHaveLength(1);
  await link.click({ modifiers: ['Control'] });
  await expect.poll(async () => (await opens()).length).toBe(2);
  expect((await opens())[1]).toEqual(['https://example.com/a', '_blank', 'noopener,noreferrer']);
});
