import {
  test,
  expect,
  TID,
  els,
  app,
  selected,
  byId,
  last,
  seededBoard,
  drag,
  shot,
  nearRect,
  rectEl,
} from './helpers';
import type { Page } from '@playwright/test';

const rectOf = (e: any) => ({ x: e.x, y: e.y, width: e.width, height: e.height });
const ids = async (page: Page) => (await els(page)).map((e) => e.id);
async function clickAt(page: Page, x: number, y: number, shift = false): Promise<void> {
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(x, y);
  if (shift) await page.keyboard.up('Shift');
}
const ABC = () => [
  rectEl('A', 400, 250, 160, 100),
  rectEl('B', 700, 250, 160, 100),
  rectEl('C', 400, 450, 160, 100),
];

test('SEL-1: click on the stroke, inside hollow, on empty', async ({ page, request }) => {
  await seededBoard(page, request, ABC());
  await clickAt(page, 400, 300);
  expect(await selected(page)).toEqual(['A']);
  await clickAt(page, 780, 300);
  expect(await selected(page)).toEqual(['B']);
  await clickAt(page, 640, 650);
  expect(await selected(page)).toEqual([]);
});

test('SEL-2: Shift+click toggles', async ({ page, request }) => {
  await seededBoard(page, request, ABC());
  await clickAt(page, 400, 300);
  expect(await selected(page)).toEqual(['A']);
  await clickAt(page, 700, 300, true);
  expect(await selected(page)).toEqual(['A', 'B']);
  await clickAt(page, 480, 250, true);
  expect(await selected(page)).toEqual(['B']);
  await clickAt(page, 480, 500, true);
  expect(await selected(page)).toEqual(['B', 'C']);
});

test('SEL-3: the marquee selects fully contained elements only, live', async ({ page, request }) => {
  await seededBoard(page, request, ABC());
  await page.mouse.move(380, 230);
  await page.mouse.down();
  await page.mouse.move(880, 370, { steps: 12 });
  await expect.poll(async () => (await app(page)).interaction.marquee).not.toBeNull();
  await expect.poll(() => selected(page)).toEqual(['A', 'B']);
  await shot(page, 'selection-marquee');
  await page.mouse.up();
  expect(await selected(page)).toEqual(['A', 'B']);
  expect((await app(page)).interaction.marquee).toBeNull();

  await clickAt(page, 640, 650);
  expect(await selected(page)).toEqual([]);
  await drag(page, { x: 380, y: 230 }, { x: 800, y: 370 });
  expect(await selected(page)).toEqual(['A']);

  await page.keyboard.down('Shift');
  await drag(page, { x: 380, y: 430 }, { x: 580, y: 570 });
  await page.keyboard.up('Shift');
  expect(await selected(page)).toEqual(['A', 'C']);
});

test('SEL-4: inside a hollow frame a drag starts a marquee and a click selects', async ({ page, request }) => {
  await seededBoard(page, request, [
    rectEl('F', 320, 180, 760, 480),
    rectEl('S1', 400, 250, 100, 60),
    rectEl('S2', 600, 250, 100, 60),
  ]);
  await drag(page, { x: 360, y: 220 }, { x: 720, y: 330 });
  expect(await selected(page)).toEqual(['S1', 'S2']);
  const f0 = await byId(page, 'F');
  expect([f0.x, f0.y]).toEqual([320, 180]);

  await clickAt(page, 900, 500);
  expect(await selected(page)).toEqual(['F']);
  await drag(page, { x: 900, y: 500 }, { x: 950, y: 520 });
  nearRect(rectOf(await byId(page, 'F')), { x: 370, y: 200, width: 760, height: 480 });
  const s1 = await byId(page, 'S1');
  const s2 = await byId(page, 'S2');
  expect([s1.x, s1.y, s2.x, s2.y]).toEqual([400, 250, 600, 250]);
});

test('SEL-5: move, axis lock, multi-move, undo', async ({ page, request }) => {
  await seededBoard(page, request, ABC());
  await clickAt(page, 400, 300);
  expect(await selected(page)).toEqual(['A']);
  await drag(page, { x: 480, y: 300 }, { x: 580, y: 350 });
  nearRect(rectOf(await byId(page, 'A')), { x: 500, y: 300, width: 160, height: 100 });

  await drag(page, { x: 580, y: 350 }, { x: 660, y: 370 }, { hold: ['Shift'] });
  const a = await byId(page, 'A');
  expect(a.x).toBeCloseTo(580, 0);
  expect(a.y).toBeCloseTo(300, 0);

  await page.keyboard.press('Control+z');
  nearRect(rectOf(await byId(page, 'A')), { x: 500, y: 300, width: 160, height: 100 });
  await page.keyboard.press('Control+z');
  nearRect(rectOf(await byId(page, 'A')), { x: 400, y: 250, width: 160, height: 100 });
  expect((await app(page)).canRedo).toBe(true);

  await page.keyboard.press('Control+a');
  expect(await selected(page)).toEqual(['A', 'B', 'C']);
  const before = await els(page);
  await drag(page, { x: 480, y: 300 }, { x: 500, y: 330 });
  const after = await els(page);
  for (const e of before) {
    const n = after.find((x) => x.id === e.id);
    expect(n.x).toBeCloseTo(e.x + 20, 0);
    expect(n.y).toBeCloseTo(e.y + 30, 0);
  }
});

test('SEL-6: resize (se, flip, Shift aspect, side handle, cursor)', async ({ page, request }) => {
  await seededBoard(page, request, [rectEl('A', 500, 300, 160, 100)]);
  await clickAt(page, 500, 350);
  expect(await selected(page)).toEqual(['A']);

  await page.mouse.move(664, 404);
  await expect(page.getByTestId(TID.canvasInteractive)).toHaveCSS('cursor', 'nwse-resize');

  await drag(page, { x: 664, y: 404 }, { x: 744, y: 454 });
  nearRect(rectOf(await byId(page, 'A')), { x: 500, y: 300, width: 240, height: 150 });
  await shot(page, 'selection-resize');
  await page.keyboard.press('Control+z');
  nearRect(rectOf(await byId(page, 'A')), { x: 500, y: 300, width: 160, height: 100 });

  // flip
  await drag(page, { x: 664, y: 404 }, { x: 444, y: 254 });
  const f = await byId(page, 'A');
  nearRect(rectOf(f), { x: 440, y: 250, width: 60, height: 50 });
  expect(f.width).toBeGreaterThan(0);
  expect(f.height).toBeGreaterThan(0);
  await page.keyboard.press('Control+z');

  // Shift keeps the aspect ratio
  await drag(page, { x: 664, y: 404 }, { x: 824, y: 424 }, { hold: ['Shift'] });
  nearRect(rectOf(await byId(page, 'A')), { x: 500, y: 300, width: 320, height: 200 });
  await page.keyboard.press('Control+z');

  // east side handle
  await drag(page, { x: 664, y: 350 }, { x: 704, y: 350 });
  nearRect(rectOf(await byId(page, 'A')), { x: 500, y: 300, width: 200, height: 100 });
});

test('SEL-7: delete, with z-order restored on undo', async ({ page, request }) => {
  await seededBoard(page, request, ABC());
  await clickAt(page, 400, 300);
  await page.keyboard.press('Delete');
  expect(await ids(page)).toEqual(['B', 'C']);
  expect(await selected(page)).toEqual([]);
  await page.keyboard.press('Control+z');
  expect(await ids(page)).toEqual(['A', 'B', 'C']);
  expect(await selected(page)).toEqual(['A']);

  await clickAt(page, 700, 300);
  await page.getByTestId(TID.actionDelete).click();
  expect(await ids(page)).toEqual(['A', 'C']);

  await clickAt(page, 400, 300);
  await page.keyboard.press('Backspace');
  expect(await ids(page)).toEqual(['C']);
});

test('SEL-8: duplicate with Ctrl+D, the button and Alt+drag', async ({ page, request }) => {
  await seededBoard(page, request, ABC());
  await clickAt(page, 400, 300);
  await page.keyboard.press('Control+d');
  let all = await els(page);
  expect(all).toHaveLength(4);
  let top = await last(page);
  expect(top.id).not.toBe('A');
  nearRect(rectOf(top), { x: 416, y: 266, width: 160, height: 100 });
  expect(await selected(page)).toEqual([top.id]);

  await page.getByTestId(TID.actionDuplicate).click();
  all = await els(page);
  expect(all).toHaveLength(5);
  top = await last(page);
  expect(top.x).toBeCloseTo(432, 0);
  expect(top.y).toBeCloseTo(282, 0);

  await clickAt(page, 700, 300);
  expect(await selected(page)).toEqual(['B']);
  await drag(page, { x: 780, y: 300 }, { x: 780, y: 400 }, { hold: ['Alt'] });
  all = await els(page);
  expect(all).toHaveLength(6);
  const b = await byId(page, 'B');
  expect([b.x, b.y]).toEqual([700, 250]);
  top = await last(page);
  nearRect(rectOf(top), { x: 700, y: 350, width: 160, height: 100 });
  expect(await selected(page)).toEqual([top.id]);
});

test('SEL-9: select all and Escape', async ({ page, request }) => {
  await seededBoard(page, request, ABC());
  await page.keyboard.press('Control+a');
  expect(await selected(page)).toHaveLength(3);
  await page.keyboard.press('Escape');
  expect(await selected(page)).toEqual([]);
  await page.keyboard.press('r');
  await page.keyboard.press('Escape');
  expect((await app(page)).tool).toBe('select');
});

test('SEL-10: nudge, merged into one undo step', async ({ page, request }) => {
  await seededBoard(page, request, ABC());
  await clickAt(page, 400, 300);
  await page.keyboard.press('ArrowRight');
  expect((await byId(page, 'A')).x).toBe(401);
  await page.keyboard.press('Shift+ArrowDown');
  expect((await byId(page, 'A')).y).toBe(260);
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
  expect((await byId(page, 'A')).x).toBe(398);
  await page.keyboard.press('Control+z');
  const a = await byId(page, 'A');
  expect([a.x, a.y]).toEqual([400, 250]);
});

test('SEL-11: z-order', async ({ page, request }) => {
  await seededBoard(page, request, ABC());
  await clickAt(page, 400, 300);
  await page.keyboard.press('Control+Shift+BracketRight');
  expect(await ids(page)).toEqual(['B', 'C', 'A']);
  await page.getByTestId(TID.actionBack).click();
  expect(await ids(page)).toEqual(['A', 'B', 'C']);
  await page.keyboard.press('Control+BracketRight');
  expect(await ids(page)).toEqual(['B', 'A', 'C']);
  await page.getByTestId(TID.actionBackward).click();
  expect(await ids(page)).toEqual(['A', 'B', 'C']);
  await page.getByTestId(TID.actionFront).click();
  expect(await ids(page)).toEqual(['B', 'C', 'A']);
});
