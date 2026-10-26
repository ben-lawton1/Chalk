import {
  test,
  expect,
  TID,
  tidTool,
  tidPenSlot,
  tidPenColor,
  tidPenSize,
  els,
  app,
  selected,
  freshBoard,
  seededBoard,
  flush,
  waitReady,
  shot,
  near,
  rectEl,
  ptrEvents,
  penStroke,
  penEraserDrag,
  penBarrelDrag,
  fingerDrag,
  fingerTap,
  pinch,
} from './helpers';
import type { Page } from '@playwright/test';

const inkOf = async (page: Page) => (await els(page)).filter((e) => e.type === 'ink');
const STROKE = [
  { x: 300, y: 300 },
  { x: 340, y: 270 },
  { x: 380, y: 320 },
  { x: 420, y: 280 },
  { x: 460, y: 310 },
];
/** A loop around the area x 250..700, y 250..420 (closes back near its start). */
const LOOP = [
  { x: 250, y: 250 },
  { x: 700, y: 250 },
  { x: 700, y: 420 },
  { x: 250, y: 420 },
  { x: 255, y: 255 },
];
const pensOf = async (page: Page) => (await app(page)).pens as { color: string; size: number }[];

test('PT-1: the pen tip draws ink with the pen tool; it survives a save and a reload', async ({ page, request }) => {
  await freshBoard(page, request);
  await page.keyboard.press('p');
  expect((await app(page)).tool).toBe('pen');
  await penStroke(page, STROKE);
  const ink = await inkOf(page);
  expect(ink).toHaveLength(1);
  expect(ink[0].pressure).toBe(true);
  expect(ink[0].points.length).toBeGreaterThanOrEqual(3);
  expect(await selected(page)).toEqual([]);
  expect((await app(page)).tool).toBe('pen');
  expect(await flush(page)).toBe('ok');
  await page.reload();
  await waitReady(page);
  const again = await inkOf(page);
  expect(again).toHaveLength(1);
  expect(again[0].points).toEqual(ink[0].points);
  await shot(page, 'pen-ink');
});

test('PT-2: the pen tray picks a pen, a colour and a size; the next stroke uses them and a reload keeps them', async ({ page, request }) => {
  await freshBoard(page, request);
  await page.getByTestId(tidTool('pen')).click();
  await expect(page.getByTestId(TID.penTray)).toBeVisible();
  expect(await app(page)).toMatchObject({ tool: 'pen', penTrayOpen: true, activePen: 0 });

  await page.getByTestId(tidPenSlot(1)).click(); // choose pen 2
  expect((await app(page)).activePen).toBe(1);
  await expect(page.getByTestId(TID.penOptions)).toBeHidden();
  await page.getByTestId(tidPenSlot(1)).click(); // again: its options
  await expect(page.getByTestId(TID.penOptions)).toBeVisible();
  await page.getByTestId(tidPenColor(5)).click(); // #4dabf7
  await page.getByTestId(tidPenSize(3)).click(); // 8
  await expect(page.getByTestId(TID.penOptions)).toBeVisible(); // choosing keeps it open
  await page.keyboard.press('Escape');
  await expect(page.getByTestId(TID.penOptions)).toBeHidden();
  expect((await app(page)).tool).toBe('pen'); // Escape closed the popover only

  await penStroke(page, STROKE);
  const ink = await inkOf(page);
  expect(ink).toHaveLength(1);
  expect(ink[0].style.strokeColor).toBe('#4dabf7');
  expect(ink[0].style.strokeWidth).toBe(8);

  await page.reload();
  await waitReady(page);
  const a = await app(page);
  expect(a.activePen).toBe(1);
  expect(a.pens[1]).toEqual({ color: '#4dabf7', size: 8 });
  expect(a.pens[0]).toEqual({ color: '#e9ecef', size: 3 });

  // The Pen button shows and hides the tray without changing the tool.
  await page.getByTestId(tidTool('pen')).click();
  await page.getByTestId(tidTool('pen')).click();
  await expect(page.getByTestId(TID.penTray)).toBeHidden();
  expect((await app(page)).tool).toBe('pen');
  await page.getByTestId(tidTool('pen')).click();
  await expect(page.getByTestId(TID.penTray)).toBeVisible();
  await page.getByTestId(TID.penEraser).click();
  expect((await app(page)).tool).toBe('eraser');
  await page.getByTestId(TID.penLasso).click();
  expect((await app(page)).tool).toBe('lasso');
  await page.keyboard.press('r'); // any other tool closes the tray
  await expect(page.getByTestId(TID.penTray)).toBeHidden();
});

test('PT-3: the pen eraser button erases a shape and an ink stroke in one undo step', async ({ page, request }) => {
  await seededBoard(page, request, [rectEl('R', 300, 300, 200, 120)]);
  await page.keyboard.press('p');
  await penStroke(page, [
    { x: 600, y: 300 },
    { x: 650, y: 300 },
    { x: 700, y: 300 },
    { x: 760, y: 300 },
    { x: 800, y: 300 },
  ]);
  expect(await inkOf(page)).toHaveLength(1);
  // Erase from the left of the rectangle, across its left edge, to the end of the stroke.
  await penEraserDrag(page, [
    { x: 250, y: 360 },
    { x: 350, y: 360 },
    { x: 500, y: 330 },
    { x: 650, y: 300 },
    { x: 780, y: 300 },
  ]);
  expect(await els(page)).toHaveLength(0);
  expect((await app(page)).tool).toBe('pen'); // the tool never changed
  expect((await app(page)).interaction.gestureActive).toBe(false);
  await page.keyboard.press('Control+z');
  const back = await els(page);
  expect(back.map((e) => e.type).sort()).toEqual(['ink', 'shape']);
});

test('PT-4: the barrel button lassos, Delete removes the selection; "Swap pen buttons" flips the two buttons', async ({ page, request }) => {
  await seededBoard(page, request, [
    rectEl('A', 300, 300, 100, 80),
    rectEl('B', 500, 300, 100, 80),
    rectEl('C', 800, 500, 100, 80),
  ]);
  await penBarrelDrag(page, LOOP);
  expect(await selected(page)).toEqual(['A', 'B']);
  expect((await app(page)).interaction.lassoActive).toBe(false);
  await page.keyboard.press('Delete');
  expect((await els(page)).map((e) => e.id)).toEqual(['C']);
  await page.keyboard.press('Control+z');
  expect(await els(page)).toHaveLength(3);

  // Swapped: the eraser button now lassos and the barrel button erases.
  await page.keyboard.press('p');
  await page.getByTestId(tidTool('pen')).click();
  await page.getByTestId(tidPenSlot(0)).click(); // the active pen again: its options
  await page.getByTestId(TID.penSwapButtons).check();
  expect((await app(page)).penButtonsSwapped).toBe(true);
  await penEraserDrag(page, LOOP);
  expect(await selected(page)).toEqual(['A', 'B']);
  expect(await els(page)).toHaveLength(3); // nothing was erased
  await penBarrelDrag(page, [
    { x: 760, y: 540 },
    { x: 860, y: 540 },
    { x: 950, y: 540 },
  ]);
  expect((await els(page)).map((e) => e.id)).toEqual(['A', 'B']);
});

test('PT-5: a finger drag pans (any tool, nothing is drawn) and two fingers pinch-zoom', async ({ page, request }) => {
  await freshBoard(page, request);
  await page.keyboard.press('p');
  await fingerDrag(page, [
    { x: 600, y: 500 },
    { x: 560, y: 460 },
    { x: 500, y: 400 },
  ]);
  const v = (await app(page)).viewport;
  near(v.scrollX, -100, 1);
  near(v.scrollY, -100, 1);
  expect(await els(page)).toHaveLength(0);
  expect((await app(page)).interaction.gestureActive).toBe(false);

  await pinch(page, { x: 500, y: 400 }, { x: 700, y: 400 }, { x: 400, y: 400 }, { x: 800, y: 400 });
  near((await app(page)).viewport.zoom, 2, 0.01);
  expect(await els(page)).toHaveLength(0);
});

test('PT-6: a tap selects, a tap on empty canvas clears, a double tap edits (and writes on empty canvas)', async ({ page, request }) => {
  await seededBoard(page, request, [rectEl('R', 400, 300, 200, 120)]);
  await fingerTap(page, { x: 500, y: 360 }); // inside the hollow rectangle: fingers are imprecise
  expect(await selected(page)).toEqual(['R']);
  await fingerTap(page, { x: 900, y: 600 });
  expect(await selected(page)).toEqual([]);

  await fingerTap(page, { x: 500, y: 360 }, 2);
  expect((await app(page)).editingId).toBe('R');
  await expect(page.getByTestId(TID.textEditor)).toBeVisible();
  await page.keyboard.type('hi');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId(TID.textEditor)).toBeHidden();
  expect((await els(page)).find((e) => e.id === 'R').label).toBe('hi');

  await fingerTap(page, { x: 900, y: 600 }, 2);
  await expect(page.getByTestId(TID.textEditor)).toBeVisible();
  const created = (await els(page)).filter((e) => e.type === 'text');
  expect(created).toHaveLength(1);
  await page.keyboard.type('note');
  await page.keyboard.press('Escape');
  expect((await els(page)).find((e) => e.type === 'text').text).toBe('note');
});

test('PT-7: palm rejection: a finger changes nothing while the pen is down, hovering or just gone', async ({ page, request }) => {
  await freshBoard(page, request);
  await page.keyboard.press('p');
  const pen = { pointerType: 'pen', pointerId: 7 } as const;
  await ptrEvents(page, [
    { type: 'pointerdown', x: 300, y: 300, ...pen, button: 0, buttons: 1 },
    { type: 'pointermove', x: 340, y: 320, ...pen, button: -1, buttons: 1 },
  ]);
  // The palm lands while the stroke is in progress.
  await fingerDrag(page, [
    { x: 600, y: 500 },
    { x: 500, y: 400 },
  ]);
  await fingerTap(page, { x: 700, y: 500 });
  expect((await app(page)).viewport).toEqual({ scrollX: 0, scrollY: 0, zoom: 1 });
  await ptrEvents(page, [
    { type: 'pointermove', x: 380, y: 330, ...pen, button: -1, buttons: 1 },
    { type: 'pointerup', x: 380, y: 330, ...pen, button: 0, buttons: 0 },
  ]);
  expect(await inkOf(page)).toHaveLength(1);

  // The pen now hovers: still no panning.
  await ptrEvents(page, [{ type: 'pointermove', x: 400, y: 340, ...pen, button: -1, buttons: 0 }]);
  await fingerDrag(page, [
    { x: 600, y: 500 },
    { x: 500, y: 400 },
  ]);
  expect((await app(page)).viewport.scrollX).toBe(0);

  // The pen leaves: after the grace period a finger pans again.
  await ptrEvents(page, [{ type: 'pointerleave', x: 400, y: 340, ...pen, button: -1, buttons: 0 }]);
  await expect
    .poll(
      async () => {
        await fingerDrag(page, [
          { x: 600, y: 500 },
          { x: 500, y: 400 },
        ]);
        return (await app(page)).viewport.scrollX;
      },
      { timeout: 5_000 },
    )
    .toBeLessThan(0);
});

test('PT-8: the pen tip inside a lasso selection moves it instead of drawing', async ({ page, request }) => {
  await seededBoard(page, request, [rectEl('A', 300, 300, 100, 80), rectEl('B', 500, 300, 100, 80)]);
  await page.keyboard.press('p');
  await penBarrelDrag(page, LOOP);
  expect(await selected(page)).toEqual(['A', 'B']);
  expect((await app(page)).tool).toBe('pen');
  // (450, 340) is in the gap between the two shapes, inside the selection box.
  await penStroke(page, [
    { x: 450, y: 340 },
    { x: 450, y: 390 },
    { x: 450, y: 440 },
  ]);
  const all = await els(page);
  expect(all.filter((e) => e.type === 'ink')).toHaveLength(0);
  near(all.find((e) => e.id === 'A').y, 400, 1);
  near(all.find((e) => e.id === 'B').y, 400, 1);
  expect(await selected(page)).toEqual(['A', 'B']);
  await page.keyboard.press('Control+z');
  near((await els(page)).find((e) => e.id === 'A').y, 300, 1);
  // Away from the selection the pen draws again and clears it.
  await penStroke(page, [
    { x: 800, y: 600 },
    { x: 850, y: 620 },
    { x: 900, y: 600 },
  ]);
  expect(await inkOf(page)).toHaveLength(1);
  expect(await selected(page)).toEqual([]);
});
