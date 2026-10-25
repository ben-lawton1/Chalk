import {
  test,
  expect,
  TID,
  els,
  app,
  selected,
  byId,
  last,
  freshBoard,
  draw,
  drag,
  shot,
  screenBounds,
  near,
  nearRect,
} from './helpers';
import type { Page } from '@playwright/test';

const editor = (page: Page) => page.getByTestId(TID.textEditor);

/** Double-click the empty canvas at (x, y), wait for the editor, type, and commit with Escape. */
async function makeText(page: Page, x: number, y: number, text: string): Promise<any> {
  await page.mouse.dblclick(x, y);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();
  return last(page);
}

test('TXT-1: double-click the empty canvas, type, Escape; one undo step', async ({ page, request }) => {
  await freshBoard(page, request);
  await page.mouse.dblclick(500, 300);
  await expect(editor(page)).toBeFocused();
  const a = await app(page);
  await expect(editor(page)).toHaveAttribute('data-editing-id', a.editingId);
  let t = await last(page);
  expect(t.type).toBe('text');
  expect(t.text).toBe('');
  expect(t.x).toBeCloseTo(500, 1);
  expect(t.y).toBeCloseTo(285, 1);

  await page.keyboard.type('Hello Chalk');
  await expect.poll(async () => (await last(page)).text).toBe('Hello Chalk');
  expect((await last(page)).width).toBeGreaterThan(40);
  await shot(page, 'text-editing');

  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();
  expect((await app(page)).editingId).toBeNull();
  t = await last(page);
  expect(t.text).toBe('Hello Chalk');
  expect(t.x).toBeCloseTo(500, 1);
  expect(t.y).toBeCloseTo(285, 1);
  expect(t.autoResize).toBe(true);
  expect(t.height).toBeCloseTo(30, 1);
  expect(await selected(page)).toEqual([t.id]);

  await page.keyboard.press('Control+z');
  expect(await els(page)).toEqual([]);
  await page.keyboard.press('Control+Shift+z');
  expect((await last(page)).text).toBe('Hello Chalk');
});

test('TXT-2: the text tool, and a click outside commits without creating', async ({ page, request }) => {
  await freshBoard(page, request);
  await page.keyboard.press('t');
  await expect(page.getByTestId(TID.hintBar)).toContainText('Click anywhere to type');
  await page.mouse.click(700, 450);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type('Second');
  await page.mouse.click(900, 600);
  await expect(editor(page)).toBeHidden();
  const all = await els(page);
  expect(all).toHaveLength(1);
  expect(all[0].text).toBe('Second');
  expect((await app(page)).tool).toBe('select');
});

test('TXT-3: empty text is discarded', async ({ page, request }) => {
  await freshBoard(page, request);
  await page.mouse.dblclick(640, 400);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();
  expect(await els(page)).toEqual([]);
  expect((await app(page)).canUndo).toBe(false);
});

test('TXT-4 and TXT-5: multi-line, Ctrl+Enter, re-edit', async ({ page, request }) => {
  await freshBoard(page, request);
  await page.mouse.dblclick(400, 200);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type('line one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('line two');
  await page.keyboard.press('Control+Enter');
  await expect(editor(page)).toBeHidden();
  let t = await last(page);
  expect(t.text).toBe('line one\nline two');
  expect(t.height).toBeCloseTo(60, 1);

  // TXT-5
  expect(await selected(page)).toEqual([t.id]);
  await page.keyboard.press('Enter');
  await expect(editor(page)).toBeFocused();
  await expect(editor(page)).toHaveAttribute('data-editing-id', t.id);
  await page.keyboard.type(' more');
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();
  t = await byId(page, t.id);
  expect(t.text).toBe('line one\nline two more');

  const sb = await screenBounds(page, t.id);
  await page.mouse.dblclick(sb!.x + sb!.width / 2, sb!.y + sb!.height / 2);
  await expect(editor(page)).toBeFocused();
  await expect(editor(page)).toHaveAttribute('data-editing-id', t.id);
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();
  expect(await els(page)).toHaveLength(1);
});

test('TXT-6: a label inside a shape grows the shape (top fixed) and undoes in one step', async ({ page, request }) => {
  await freshBoard(page, request);
  await draw(page, 'r', { x: 400, y: 250 }, { x: 560, y: 350 });
  const r = await last(page);
  nearRect(r, { x: 400, y: 250, width: 160, height: 100 });
  expect(await selected(page)).toEqual([r.id]);

  await page.keyboard.press('Enter');
  await expect(editor(page)).toBeFocused();
  await expect(editor(page)).toHaveAttribute('data-editing-id', r.id);
  for (const [i, word] of ['one', 'two', 'three', 'four'].entries()) {
    if (i > 0) await page.keyboard.press('Enter');
    await page.keyboard.type(word);
  }
  await expect.poll(async () => (await byId(page, r.id)).height).toBeCloseTo(136, 0);
  await shot(page, 'text-label');
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();

  const after = await byId(page, r.id);
  expect(after.label).toBe('one\ntwo\nthree\nfour');
  nearRect(after, { x: 400, y: 250, width: 160, height: 136 });
  expect(await selected(page)).toEqual([r.id]);

  await page.keyboard.press('Control+z');
  const undone = await byId(page, r.id);
  expect(undone.label).toBe('');
  expect(undone.height).toBeCloseTo(100, 1);
});

test('TXT-7: double-click a hollow shape to label it; trailing spaces trimmed; no growth when it fits', async ({
  page,
  request,
}) => {
  await freshBoard(page, request);
  await draw(page, 'o', { x: 650, y: 250 }, { x: 810, y: 350 });
  const e = await last(page);
  await page.mouse.dblclick(730, 300);
  await expect(editor(page)).toBeFocused();
  await expect(editor(page)).toHaveAttribute('data-editing-id', e.id);
  await page.keyboard.type('Ship it ');
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();
  const after = await byId(page, e.id);
  expect(after.label).toBe('Ship it');
  expect(after.height).toBeCloseTo(100, 1);
  expect(await els(page)).toHaveLength(1);
});

test('TXT-8: the editor overlay lines up with the canvas while zoomed', async ({ page, request }) => {
  await freshBoard(page, request);
  await page.keyboard.press('Control+Equal');
  await expect.poll(async () => (await app(page)).viewport.zoom).toBeCloseTo(1.2, 5);
  await page.mouse.dblclick(640, 400);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type('Aligned');
  const id = (await app(page)).editingId;
  await expect.poll(async () => (await byId(page, id)).text).toBe('Aligned');
  const tb = await editor(page).boundingBox();
  const eb = await screenBounds(page, id);
  expect(tb).not.toBeNull();
  expect(Math.abs(tb!.x - eb!.x)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(tb!.y - eb!.y)).toBeLessThanOrEqual(1.5);
  await page.keyboard.press('Escape');
});

test('TXT-9: the e/w handle turns free text into a fixed-width wrapping box', async ({ page, request }) => {
  await freshBoard(page, request);
  const t = await makeText(page, 500, 300, 'Hello Chalk');
  expect(await selected(page)).toEqual([t.id]);
  const b = (await screenBounds(page, t.id))!;
  await drag(page, { x: Math.round(b.x + b.width + 4), y: 300 }, { x: 564, y: 300 });
  const after = await byId(page, t.id);
  expect(after.autoResize).toBe(false);
  near(after.width, 60, 1);
  expect(after.x).toBeCloseTo(500, 1);
  expect(after.height).toBeGreaterThanOrEqual(60);
});

test('TXT-10: a corner handle scales the font', async ({ page, request }) => {
  await freshBoard(page, request);
  const t = await makeText(page, 500, 300, 'Hello Chalk');
  const b = (await screenBounds(page, t.id))!;
  await drag(
    page,
    { x: Math.round(b.x + b.width + 4), y: Math.round(b.y + b.height + 4) },
    { x: Math.round(b.x + 2 * b.width + 4), y: Math.round(b.y + 2 * b.height + 4) },
  );
  const after = await byId(page, t.id);
  near(after.style.fontSize, 48, 0.5);
  expect(after.autoResize).toBe(true);
});
