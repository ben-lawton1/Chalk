import { test, expect, TID, app, freshBoard, flush, shot, waitReady, draw, els } from './helpers';
import type { Page } from '@playwright/test';

// Quick checks for the notes editor itself (N-B). The full notes spec (menus, links, tables) is notes.spec.ts.
const notesText = (page: Page): Promise<string> => page.evaluate(() => (window as any).__CHALK__.getNotesText());
const notesDoc = (page: Page): Promise<any> => page.evaluate(() => (window as any).__CHALK__.getNotes());
const active = async (page: Page): Promise<boolean> => (await app(page)).notesActive;
const editorEl = (page: Page) => page.getByTestId(TID.notesEditor);

async function enter(page: Page): Promise<void> {
  await page.getByTestId(TID.toolNotes).click();
  await expect(editorEl(page)).toBeFocused();
}
const types = (doc: any): string[] => (doc?.doc?.content ?? []).map((n: any) => n.type);

test('Notes button enters notes mode; two paragraphs persist across a reload', async ({ page, request }) => {
  await freshBoard(page, request);
  expect(await active(page)).toBe(false);
  await enter(page);
  expect(await active(page)).toBe(true);
  await expect(page.getByTestId(TID.toolNotes)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.type('Hello notes');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second line');
  await expect.poll(() => notesText(page)).toBe('Hello notes\nSecond line');
  await shot(page, 'notes-basic');
  expect(await flush(page)).toBe('ok');
  await page.reload();
  await waitReady(page);
  await expect.poll(() => notesText(page)).toBe('Hello notes\nSecond line');
  expect(await active(page)).toBe(false);
});

test('markdown shortcuts build blocks', async ({ page, request }) => {
  await freshBoard(page, request);
  await enter(page);
  const k = page.keyboard;
  await k.type('# Title');
  await k.press('Enter');
  await k.type('- bullet');
  await k.press('Enter');
  await k.press('Enter'); // leaves the list
  await k.type('1. one');
  await k.press('Enter');
  await k.press('Enter');
  await k.type('[] todo');
  await k.press('Enter');
  await k.press('Enter');
  await k.type('> quote');
  await k.press('Enter');
  await k.press('Enter');
  await k.type('" notion quote');
  await k.press('Enter');
  await k.press('Enter');
  await k.type('---');
  await k.type('```js ');
  await k.type('const a = 1;');
  await k.press('Enter');
  await k.press('Tab');
  await k.type('x');
  await expect.poll(async () => types(await notesDoc(page))).toEqual(
    ['heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'horizontalRule', 'codeBlock', 'paragraph'],
  );
  const doc = await notesDoc(page);
  expect(doc.doc.content[0].attrs.level).toBe(1);
  expect(doc.doc.content[4].content.length).toBe(2); // the `" ` quote joined the `> ` quote above it
  const code = doc.doc.content[6];
  expect(code.attrs.language).toBe('js');
  expect(code.content[0].text).toBe('const a = 1;\n  x');
  await shot(page, 'notes-markdown');
});

test('marks, toggle, heading and list shortcuts', async ({ page, request }) => {
  await freshBoard(page, request);
  await enter(page);
  const k = page.keyboard;
  await k.type('**b** and `c` and ==h== and ~~s~~ ');
  await k.press('Enter');
  await k.press('Control+Alt+2');
  await k.type('h2');
  await k.press('Enter');
  await k.press('Control+Shift+8');
  await k.type('bul');
  await k.press('Enter');
  await k.press('Enter');
  await k.press('Control+Shift+9');
  await k.type('td');
  await k.press('Enter');
  await k.press('Enter');
  await k.type('>> toggle title');
  const doc = await notesDoc(page);
  const marks = doc.doc.content[0].content.map((n: any) => (n.marks ?? []).map((m: any) => m.type).join('+'));
  expect(marks).toEqual(expect.arrayContaining(['bold', 'code', 'highlight', 'strike']));
  expect(types(doc)).toEqual(['paragraph', 'heading', 'bulletList', 'taskList', 'details', 'paragraph']);
  await shot(page, 'notes-marks');
});

test('block move, callout node and Ctrl+K link prompt', async ({ page, request }) => {
  await freshBoard(page, request);
  await enter(page);
  const k = page.keyboard;
  await k.type('first');
  await k.press('Enter');
  await k.type('second');
  await k.press('Alt+Shift+ArrowUp');
  await expect.poll(() => notesText(page)).toBe('second\nfirst');
  await k.press('Alt+Shift+ArrowDown');
  await expect.poll(() => notesText(page)).toBe('first\nsecond');
  await k.press('Control+k');
  await page.getByTestId(TID.notesLinkInput).fill('example.com');
  await page.keyboard.press('Enter');
  await expect.poll(async () => JSON.stringify(await notesDoc(page))).toContain('https://example.com');
});

test('Esc leaves notes mode; N restores the caret on the same spot', async ({ page, request }) => {
  await freshBoard(page, request);
  await enter(page);
  await page.keyboard.type('alpha');
  await page.keyboard.press('Enter');
  await page.keyboard.type('beta');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('End');
  await page.keyboard.press('Escape');
  expect(await active(page)).toBe(false);
  await expect(editorEl(page)).not.toBeFocused();
  await page.keyboard.press('n');
  await expect(editorEl(page)).toBeFocused();
  await page.keyboard.type('!');
  await expect.poll(() => notesText(page)).toBe('alpha!\nbeta');
});

test('inactive notes pass pointer input through; double-click in the column enters notes mode', async ({ page, request }) => {
  await freshBoard(page, request);
  await enter(page);
  await page.keyboard.type('Some typed notes here');
  await page.keyboard.press('Escape');
  expect(await active(page)).toBe(false);
  // A rectangle drawn across the column still works.
  await draw(page, 'r', { x: 200, y: 60 }, { x: 400, y: 160 });
  await expect.poll(async () => (await els(page)).length).toBe(1);
  expect(await active(page)).toBe(false);
  await page.getByTestId('tool-select').click();
  // Double-click on the text puts the caret there.
  await page.mouse.dblclick(600, 108);
  await expect.poll(() => active(page)).toBe(true);
  await expect(editorEl(page)).toBeFocused();
  // Clicking the canvas outside the column leaves notes mode (and starts the usual marquee/select there).
  await page.mouse.click(1100, 600);
  expect(await active(page)).toBe(false);
  // Double-click outside the column still makes free text.
  await page.mouse.dblclick(1100, 600);
  await expect(page.getByTestId(TID.textEditor)).toBeFocused();
  await page.keyboard.press('Escape');
});

test('choosing a tool, or the pen, leaves notes mode; the pen tool is never in notes mode', async ({ page, request }) => {
  await freshBoard(page, request);
  await enter(page);
  await page.getByTestId('tool-rectangle').click();
  expect(await active(page)).toBe(false);
  await page.getByTestId('tool-pen').click();
  await page.keyboard.press('n');
  expect(await active(page)).toBe(true);
  expect((await app(page)).tool).toBe('select');
});

test('in notes mode a finger drag on the column pans the page and a pinch zooms', async ({ page, request }) => {
  await freshBoard(page, request);
  await enter(page);
  await page.keyboard.type('pan me');
  const before = (await app(page)).viewport;
  await touchOnColumn(page, [
    { type: 'pointerdown', id: 31, x: 300, y: 300 },
    { type: 'pointermove', id: 31, x: 300, y: 260 },
    { type: 'pointermove', id: 31, x: 300, y: 200 },
    { type: 'pointerup', id: 31, x: 300, y: 200 },
  ]);
  const after = (await app(page)).viewport;
  expect(after.scrollY).toBeLessThan(before.scrollY - 50);
  expect(after.zoom).toBe(before.zoom);
  expect(await active(page)).toBe(true);
  await touchOnColumn(page, [
    { type: 'pointerdown', id: 41, x: 300, y: 300 },
    { type: 'pointerdown', id: 42, x: 340, y: 300 },
    { type: 'pointermove', id: 41, x: 280, y: 300 },
    { type: 'pointermove', id: 42, x: 360, y: 300 },
    { type: 'pointermove', id: 41, x: 260, y: 300 },
    { type: 'pointermove', id: 42, x: 380, y: 300 },
    { type: 'pointerup', id: 41, x: 260, y: 300 },
    { type: 'pointerup', id: 42, x: 380, y: 300 },
  ]);
  expect((await app(page)).viewport.zoom).toBeGreaterThan(1.5);
  expect(await notesText(page)).toBe('pan me');
});

test('zoom to fit includes the notes column; the caret is brought on screen', async ({ page, request }) => {
  await freshBoard(page, request);
  await enter(page);
  for (let i = 0; i < 60; i++) {
    await page.keyboard.type(`line ${i}`);
    await page.keyboard.press('Enter');
  }
  // typing far below the fold panned the view to keep the caret visible
  expect((await app(page)).viewport.scrollY).toBeLessThan(-100);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+Digit1');
  const v = (await app(page)).viewport;
  expect(v.zoom).toBeLessThan(1);
});

/** Synthetic touch PointerEvents dispatched on the notes column (the shared helpers target the canvas). */
function touchOnColumn(page: Page, events: { type: string; id: number; x: number; y: number }[]): Promise<void> {
  return page.evaluate((list) => {
    const column = document.querySelector('[data-testid="notes-column"]')!;
    for (const e of list) {
      column.dispatchEvent(
        new PointerEvent(e.type, {
          bubbles: true, cancelable: true, composed: true, clientX: e.x, clientY: e.y, pointerId: e.id, pointerType: 'touch', isPrimary: true,
          pressure: e.type === 'pointerup' ? 0 : 0.5, button: 0, buttons: e.type === 'pointerup' ? 0 : 1,
        }),
      );
    }
  }, events);
}
