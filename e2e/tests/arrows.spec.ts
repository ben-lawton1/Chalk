import {
  test,
  expect,
  TID,
  tidWidth,
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
  nearPt,
  nearRect,
} from './helpers';
import type { Page } from '@playwright/test';

const rectOf = (e: any) => ({ x: e.x, y: e.y, width: e.width, height: e.height });
const editor = (page: Page) => page.getByTestId(TID.textEditor);

/** Two hollow rects drawn through the UI. Returns their ids. */
async function drawAB(page: Page): Promise<{ A: string; B: string }> {
  await draw(page, 'r', { x: 300, y: 300 }, { x: 460, y: 400 });
  const A = (await last(page)).id;
  nearRect(rectOf(await byId(page, A)), { x: 300, y: 300, width: 160, height: 100 });
  await draw(page, 'r', { x: 800, y: 300 }, { x: 960, y: 400 });
  const B = (await last(page)).id;
  nearRect(rectOf(await byId(page, B)), { x: 800, y: 300, width: 160, height: 100 });
  return { A, B };
}

/** Arrow tool, hover A, drag to B. Returns the arrow. */
async function connectAB(page: Page): Promise<any> {
  await page.keyboard.press('a');
  await page.mouse.move(379, 349);
  await page.mouse.move(380, 350);
  await drag(page, { x: 380, y: 350 }, { x: 880, y: 350 });
  const arrow = await last(page);
  expect(arrow.type).toBe('arrow');
  return arrow;
}

test('ARR-1: hover highlight, then bind A to B', async ({ page, request }) => {
  await freshBoard(page, request);
  const { A, B } = await drawAB(page);
  await page.keyboard.press('a');
  await page.mouse.move(379, 349);
  await page.mouse.move(380, 350);
  await expect.poll(async () => (await app(page)).interaction.bindTargetId).toBe(A);

  await page.mouse.down();
  await page.mouse.move(880, 350, { steps: 12 });
  await expect.poll(async () => (await app(page)).interaction.bindTargetId).toBe(B);
  await shot(page, 'arrow-binding');
  await page.mouse.up();

  const all = await els(page);
  expect(all).toHaveLength(3);
  const arrow = all[2];
  expect(arrow.type).toBe('arrow');
  expect(arrow.startBinding).toEqual({ elementId: A, fixedPoint: [0.5, 0.5] });
  expect(arrow.endBinding).toEqual({ elementId: B, fixedPoint: [0.5, 0.5] });
  nearPt(arrow.start, { x: 466, y: 350 });
  nearPt(arrow.end, { x: 794, y: 350 });
  expect(arrow.style.startArrowhead).toBe('none');
  expect(arrow.style.endArrowhead).toBe('arrow');
  expect(await selected(page)).toEqual([arrow.id]);
  const a = await app(page);
  expect(a.tool).toBe('select');
  expect(a.interaction.bindTargetId).toBeNull();
});

test('ARR-2: the arrow follows when B moves, and survives undo/redo', async ({ page, request }) => {
  await freshBoard(page, request);
  const { B } = await drawAB(page);
  const arrow = await connectAB(page);

  await drag(page, { x: 880, y: 300 }, { x: 880, y: 500 });
  nearRect(rectOf(await byId(page, B)), { x: 800, y: 500, width: 160, height: 100 });
  let a = await byId(page, arrow.id);
  expect(a.endBinding.elementId).toBe(B);
  nearPt(a.start, { x: 465.57, y: 384.23 });
  nearPt(a.end, { x: 794.43, y: 515.77 });
  await shot(page, 'arrows-follow');

  await page.keyboard.press('Control+z');
  expect((await byId(page, B)).y).toBeCloseTo(300, 1);
  a = await byId(page, arrow.id);
  nearPt(a.start, { x: 466, y: 350 });
  nearPt(a.end, { x: 794, y: 350 });

  await page.keyboard.press('Control+Shift+z');
  expect((await byId(page, B)).y).toBeCloseTo(500, 1);
  a = await byId(page, arrow.id);
  nearPt(a.end, { x: 794.43, y: 515.77 });
});

test('ARR-3: the arrow follows label growth', async ({ page, request }) => {
  await freshBoard(page, request);
  const { A } = await drawAB(page);
  const arrow = await connectAB(page);
  const s0 = (await byId(page, arrow.id)).start;

  await page.mouse.click(300, 350);
  expect(await selected(page)).toEqual([A]);
  await page.keyboard.press('Enter');
  await expect(editor(page)).toBeFocused();
  for (const [i, ch] of ['a', 'b', 'c', 'd'].entries()) {
    if (i > 0) await page.keyboard.press('Enter');
    await page.keyboard.type(ch);
  }
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();

  expect((await byId(page, A)).height).toBeCloseTo(136, 0);
  const a = await byId(page, arrow.id);
  nearPt(a.start, { x: 466.0, y: 364.9 }, 1);
  expect(Math.hypot(a.start.x - s0.x, a.start.y - s0.y)).toBeGreaterThan(1);
  expect(a.startBinding.elementId).toBe(A);
});

test('ARR-4: deleting a bound shape freezes the end; undo restores the binding', async ({ page, request }) => {
  await freshBoard(page, request);
  const { A, B } = await drawAB(page);
  const arrow = await connectAB(page);
  const e0 = (await byId(page, arrow.id)).end;

  await page.mouse.click(880, 300);
  expect(await selected(page)).toEqual([B]);
  await page.keyboard.press('Delete');
  expect((await els(page)).map((e) => e.id)).toEqual([A, arrow.id]);
  let a = await byId(page, arrow.id);
  expect(a.endBinding).toBeNull();
  nearPt(a.end, e0, 1e-6);
  expect(a.startBinding.elementId).toBe(A);

  await page.keyboard.press('Control+z');
  expect(await byId(page, B)).toBeDefined();
  expect((await byId(page, arrow.id)).endBinding.elementId).toBe(B);

  await page.keyboard.press('Control+Shift+z');
  expect(await byId(page, B)).toBeUndefined();
  expect((await byId(page, arrow.id)).endBinding).toBeNull();
});

test('ARR-5: moving only the arrow unbinds both ends', async ({ page, request }) => {
  await freshBoard(page, request);
  await drawAB(page);
  const arrow = await connectAB(page);
  await page.mouse.click(630, 350);
  expect(await selected(page)).toEqual([arrow.id]);
  await drag(page, { x: 630, y: 350 }, { x: 630, y: 290 });
  const a = await byId(page, arrow.id);
  nearPt(a.start, { x: 466, y: 290 });
  nearPt(a.end, { x: 794, y: 290 });
  expect(a.startBinding).toBeNull();
  expect(a.endBinding).toBeNull();

  await page.keyboard.press('Control+z');
  const u = await byId(page, arrow.id);
  expect(u.startBinding).not.toBeNull();
  expect(u.endBinding).not.toBeNull();
});

test('ARR-6: moving the arrow together with both shapes keeps its bindings', async ({ page, request }) => {
  await freshBoard(page, request);
  const { A, B } = await drawAB(page);
  const arrow = await connectAB(page);
  await page.keyboard.press('Control+a');
  await drag(page, { x: 630, y: 350 }, { x: 630, y: 400 });
  expect((await byId(page, A)).y).toBeCloseTo(350, 1);
  expect((await byId(page, B)).y).toBeCloseTo(350, 1);
  const a = await byId(page, arrow.id);
  nearPt(a.start, { x: 466, y: 400 });
  nearPt(a.end, { x: 794, y: 400 });
  expect(a.startBinding.elementId).toBe(A);
  expect(a.endBinding.elementId).toBe(B);
});

test('ARR-7: dragging an endpoint re-binds; dropping it over its own start shape stays unbound', async ({
  page,
  request,
}) => {
  await freshBoard(page, request);
  const { A } = await drawAB(page);
  const arrow = await connectAB(page);
  await draw(page, 'r', { x: 550, y: 520 }, { x: 710, y: 620 });
  const C = (await last(page)).id;

  await page.mouse.click(630, 350);
  expect(await selected(page)).toEqual([arrow.id]);
  await drag(page, { x: 794, y: 350 }, { x: 630, y: 570 });
  let a = await byId(page, arrow.id);
  expect(a.endBinding.elementId).toBe(C);
  nearPt(a.end, { x: 568.68, y: 516.04 }, 1);
  nearPt(a.start, { x: 441.32, y: 403.96 }, 1);

  await page.mouse.move(a.end.x, a.end.y);
  await page.mouse.down();
  await page.mouse.move(380, 350, { steps: 12 });
  expect((await app(page)).interaction.bindTargetId).toBeNull();
  await page.mouse.up();
  a = await byId(page, arrow.id);
  expect(a.endBinding).toBeNull();
  expect(a.startBinding.elementId).toBe(A);
});

test('ARR-8: Ctrl suppresses binding', async ({ page, request }) => {
  await freshBoard(page, request);
  await drawAB(page);
  await page.keyboard.press('a');
  await drag(page, { x: 380, y: 350 }, { x: 880, y: 350 }, { hold: ['Control'] });
  const a = await last(page);
  expect(a.type).toBe('arrow');
  expect(a.startBinding).toBeNull();
  expect(a.endBinding).toBeNull();
  nearPt(a.start, { x: 380, y: 350 });
  nearPt(a.end, { x: 880, y: 350 });
});

test('ARR-9: a free arrow with Shift snaps to 15 degrees', async ({ page, request }) => {
  await freshBoard(page, request);
  await page.keyboard.press('a');
  await drag(page, { x: 400, y: 600 }, { x: 600, y: 640 }, { hold: ['Shift'] });
  const a = await last(page);
  nearPt(a.start, { x: 400, y: 600 });
  nearPt(a.end, { x: 597.01, y: 652.79 });
  expect(a.startBinding).toBeNull();
  expect(a.endBinding).toBeNull();
});

test('ARR-10: the line tool has no heads, still binds, and leaves the sticky arrowheads alone', async ({
  page,
  request,
}) => {
  await freshBoard(page, request);
  const { A, B } = await drawAB(page);
  await page.keyboard.press('l');
  await drag(page, { x: 380, y: 350 }, { x: 880, y: 350 });
  let l = await last(page);
  expect(l.type).toBe('arrow');
  expect(l.style.startArrowhead).toBe('none');
  expect(l.style.endArrowhead).toBe('none');
  expect(l.startBinding.elementId).toBe(A);
  expect(l.endBinding.elementId).toBe(B);

  await page.keyboard.press('a');
  await drag(page, { x: 380, y: 380 }, { x: 880, y: 380 });
  l = await last(page);
  expect(l.style.endArrowhead).toBe('arrow');
});

test('ARR-11: arrow label', async ({ page, request }) => {
  await freshBoard(page, request);
  await drawAB(page);
  const arrow = await connectAB(page);
  await page.mouse.dblclick(630, 350);
  await expect(editor(page)).toBeFocused();
  await expect(editor(page)).toHaveAttribute('data-editing-id', arrow.id);
  await page.keyboard.type('yes');
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();
  expect((await byId(page, arrow.id)).label).toBe('yes');
  const sb = await screenBounds(page, arrow.id);
  expect(sb!.height).toBeGreaterThanOrEqual(30);
});

test('ARR-12: a stroke-width change re-routes the bound end', async ({ page, request }) => {
  await freshBoard(page, request);
  const { B } = await drawAB(page);
  const arrow = await connectAB(page);
  await page.mouse.click(880, 300);
  expect(await selected(page)).toEqual([B]);
  await page.getByTestId(tidWidth(4)).click();
  expect((await byId(page, B)).style.strokeWidth).toBe(4);
  const a = await byId(page, arrow.id);
  nearPt(a.end, { x: 793, y: 350 });
  await shot(page, 'arrows');
});
