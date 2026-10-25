import { test, expect, els, app, selected, byId, last, freshBoard, draw, drag, shot, nearRect } from './helpers';
import type { Page } from '@playwright/test';

const rectOf = (e: any) => ({ x: e.x, y: e.y, width: e.width, height: e.height });

async function drawAB(page: Page): Promise<{ A: string; B: string }> {
  await draw(page, 'r', { x: 300, y: 300 }, { x: 460, y: 400 });
  const A = (await last(page)).id;
  await draw(page, 'r', { x: 800, y: 300 }, { x: 960, y: 400 });
  const B = (await last(page)).id;
  return { A, B };
}

async function connectAB(page: Page): Promise<void> {
  await page.keyboard.press('a');
  await page.mouse.move(379, 349);
  await page.mouse.move(380, 350);
  await drag(page, { x: 380, y: 350 }, { x: 880, y: 350 });
}

/** Dispatch a paste event with plain text, like a paste from another application. */
async function pasteText(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, text);
}

test('CLP-1: copy, then paste at the pointer', async ({ page, request }) => {
  await freshBoard(page, request);
  await draw(page, 'r', { x: 400, y: 250 }, { x: 560, y: 350 });
  const orig = await last(page);
  await page.keyboard.press('Control+c');
  await page.mouse.move(800, 500);
  await page.keyboard.press('Control+v');
  await expect.poll(async () => (await els(page)).length).toBe(2);
  const pasted = await last(page);
  expect(pasted.id).not.toBe(orig.id);
  nearRect(rectOf(pasted), { x: 720, y: 450, width: 160, height: 100 });
  expect(await selected(page)).toEqual([pasted.id]);

  await page.keyboard.press('Control+v');
  await expect.poll(async () => (await els(page)).length).toBe(3);
  nearRect(rectOf(await last(page)), { x: 720, y: 450, width: 160, height: 100 });
  await shot(page, 'clipboard');
});

test('CLP-2: cut, then paste', async ({ page, request }) => {
  await freshBoard(page, request);
  await draw(page, 'r', { x: 400, y: 250 }, { x: 560, y: 350 });
  const R = (await last(page)).id;
  await page.keyboard.press('Control+x');
  await expect.poll(async () => (await els(page)).length).toBe(0);
  await page.mouse.move(640, 400);
  await page.keyboard.press('Control+v');
  await expect.poll(async () => (await els(page)).length).toBe(1);
  const p = await last(page);
  expect(p.id).not.toBe(R);
  nearRect(rectOf(p), { x: 560, y: 350, width: 160, height: 100 });

  await page.keyboard.press('Control+z');
  expect(await els(page)).toHaveLength(0);
  await page.keyboard.press('Control+z');
  expect(await byId(page, R)).toBeDefined();
});

test('CLP-3: plain text from another app becomes a text element', async ({ page, request }) => {
  await freshBoard(page, request);
  await page.mouse.move(600, 300);
  await pasteText(page, 'Hello from the clipboard');
  await expect.poll(async () => (await els(page)).length).toBe(1);
  let t = await last(page);
  expect(t.type).toBe('text');
  expect(t.text).toBe('Hello from the clipboard');
  expect(t.x).toBeCloseTo(600, 1);
  expect(t.y).toBeCloseTo(285, 1);
  expect(await selected(page)).toEqual([t.id]);

  await pasteText(page, 'a\r\nb');
  await expect.poll(async () => (await els(page)).length).toBe(2);
  t = await last(page);
  expect(t.text).toBe('a\nb');
});

test('CLP-4: copying shapes with their arrow remaps the bindings to the copies', async ({ page, request }) => {
  await freshBoard(page, request);
  const { A, B } = await drawAB(page);
  await connectAB(page);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  await page.mouse.move(640, 600);
  await page.keyboard.press('Control+v');
  await expect.poll(async () => (await els(page)).length).toBe(6);

  const all = await els(page);
  const fresh = all.slice(3);
  expect((await selected(page)).sort()).toEqual(fresh.map((e) => e.id).sort());
  const newA = fresh.find((e) => e.type === 'shape' && Math.abs(e.x - 310) < 1);
  const newB = fresh.find((e) => e.type === 'shape' && e !== newA);
  const newArrow = fresh.find((e) => e.type === 'arrow');
  expect(newA).toBeDefined();
  expect(newB).toBeDefined();
  expect(newArrow).toBeDefined();
  nearRect(rectOf(newA), { x: 310, y: 550, width: 160, height: 100 });
  expect([A, B]).not.toContain(newA.id);
  expect([A, B]).not.toContain(newB.id);
  expect(newArrow.startBinding.elementId).toBe(newA.id);
  expect(newArrow.endBinding.elementId).toBe(newB.id);
});

test('CLP-5: the copy event carries chalk JSON', async ({ page, request }) => {
  await freshBoard(page, request);
  await page.evaluate(() =>
    window.addEventListener('copy', (e) => {
      (window as any).__copied = e.clipboardData?.getData('text/plain') ?? null;
    }),
  );
  await draw(page, 'r', { x: 400, y: 250 }, { x: 560, y: 350 });
  await page.keyboard.press('Control+c');
  await expect.poll(() => page.evaluate(() => (window as any).__copied ?? null)).not.toBeNull();
  const parsed = JSON.parse(await page.evaluate(() => (window as any).__copied));
  expect(parsed.type).toBe('chalk/scene');
  expect(parsed.version).toBe(1);
  expect(parsed.elements).toHaveLength(1);
  expect((await app(page)).editingId).toBeNull();
});
