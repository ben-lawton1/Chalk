import { test, expect, TID, tidTool, els, app, selected, last, freshBoard, paletteDrag, shot, nearRect } from './helpers';

const rectOf = (e: any) => ({ x: e.x, y: e.y, width: e.width, height: e.height });

test('PAL-1: drag a rectangle from the toolbar, true-size preview, one undo step', async ({ page, request }) => {
  await freshBoard(page, request);
  const b = await page.getByTestId(tidTool('rectangle')).boundingBox();
  if (!b) throw new Error('no bbox');
  const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };

  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 2, c.y + 2);
  await expect(page.getByTestId(TID.dragGhost)).toBeHidden();
  await page.mouse.move(c.x + 8, c.y + 8);
  await expect(page.getByTestId(TID.dragGhost)).toBeVisible();
  expect((await app(page)).interaction.dropPreview).toBeNull();

  await page.mouse.move(640, 400, { steps: 12 });
  await expect(page.getByTestId(TID.dragGhost)).toBeHidden();
  await expect.poll(async () => (await app(page)).interaction.dropPreview?.kind).toBe('rectangle');
  nearRect((await app(page)).interaction.dropPreview.rect, { x: 560, y: 350, width: 160, height: 100 });
  await shot(page, 'palette-preview');

  await page.mouse.move(700, 450);
  await expect
    .poll(async () => (await app(page)).interaction.dropPreview?.rect?.x)
    .toBeCloseTo(620, 0);
  nearRect((await app(page)).interaction.dropPreview.rect, { x: 620, y: 400, width: 160, height: 100 });

  await page.mouse.up();
  const all = await els(page);
  expect(all).toHaveLength(1);
  expect(all[0].shape).toBe('rectangle');
  nearRect(rectOf(all[0]), { x: 620, y: 400, width: 160, height: 100 });
  expect(await selected(page)).toEqual([all[0].id]);
  const a = await app(page);
  expect(a.tool).toBe('select');
  expect(a.interaction.dropPreview).toBeNull();
  await expect(page.getByTestId(tidTool('rectangle'))).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId(TID.dragGhost)).toBeHidden();
  await shot(page, 'palette-drop');

  await page.keyboard.press('Control+z');
  expect(await els(page)).toEqual([]);
  await page.keyboard.press('Control+Shift+z');
  expect(await els(page)).toEqual(all);
});

test('PAL-2: every kind uses its default size', async ({ page, request }) => {
  await freshBoard(page, request);
  await paletteDrag(page, 'diamond', { x: 500, y: 300 });
  let e = await last(page);
  expect(e.shape).toBe('diamond');
  nearRect(rectOf(e), { x: 420, y: 240, width: 160, height: 120 });
  expect((await app(page)).tool).toBe('select');

  await paletteDrag(page, 'ellipse', { x: 800, y: 300 });
  e = await last(page);
  expect(e.shape).toBe('ellipse');
  nearRect(rectOf(e), { x: 720, y: 250, width: 160, height: 100 });
  expect((await app(page)).tool).toBe('select');

  await paletteDrag(page, 'triangle', { x: 650, y: 550 });
  e = await last(page);
  expect(e.shape).toBe('triangle');
  nearRect(rectOf(e), { x: 580, y: 490, width: 140, height: 120 });
  expect((await app(page)).tool).toBe('select');
});

test('PAL-3: a drop off the canvas creates nothing', async ({ page, request }) => {
  await freshBoard(page, request);
  const center = async (id: string) => {
    const b = await page.getByTestId(id).boundingBox();
    if (!b) throw new Error('no bbox ' + id);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };

  const from = await center(tidTool('diamond'));
  const to = await center(tidTool('text'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  expect(await els(page)).toEqual([]);
  let a = await app(page);
  expect(a.tool).toBe('select');
  expect(a.interaction.dropPreview).toBeNull();
  await expect(page.getByTestId(TID.dragGhost)).toBeHidden();

  const e = await center(tidTool('ellipse'));
  await page.mouse.move(e.x, e.y);
  await page.mouse.down();
  await page.mouse.move(640, 400, { steps: 12 });
  await expect.poll(async () => (await app(page)).interaction.dropPreview?.kind).toBe('ellipse');
  const h = await center(tidTool('hand'));
  await page.mouse.move(h.x, h.y, { steps: 12 });
  await page.mouse.up();
  expect(await els(page)).toEqual([]);
  a = await app(page);
  expect(a.interaction.dropPreview).toBeNull();
  await expect(page.getByTestId(TID.dragGhost)).toBeHidden();
});

test('PAL-4: Escape cancels a palette drag', async ({ page, request }) => {
  await freshBoard(page, request);
  const b = await page.getByTestId(tidTool('rectangle')).boundingBox();
  if (!b) throw new Error('no bbox');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(640, 400, { steps: 12 });
  await expect.poll(async () => (await app(page)).interaction.dropPreview?.kind).toBe('rectangle');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await app(page)).interaction.dropPreview).toBeNull();
  await page.mouse.up();
  expect(await els(page)).toEqual([]);
  expect((await app(page)).tool).toBe('select');
});

test('PAL-5: a click (no drag) arms the tool', async ({ page, request }) => {
  await freshBoard(page, request);
  await page.getByTestId(tidTool('ellipse')).click();
  expect((await app(page)).tool).toBe('ellipse');
  await expect(page.getByTestId(tidTool('ellipse'))).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.click(640, 400);
  const e = await last(page);
  expect(e.shape).toBe('ellipse');
  nearRect(rectOf(e), { x: 560, y: 350, width: 160, height: 100 });
  expect((await app(page)).tool).toBe('select');
});

test('PAL-6: the drop preview is true size at the current zoom', async ({ page, request }) => {
  await freshBoard(page, request);
  await page.keyboard.press('Control+Equal');
  await expect.poll(async () => (await app(page)).viewport.zoom).toBeCloseTo(1.2, 5);

  await paletteDrag(page, 'rectangle', { x: 640, y: 400 }, { release: false });
  await expect.poll(async () => (await app(page)).interaction.dropPreview?.kind).toBe('rectangle');
  nearRect((await app(page)).interaction.dropPreview.rect, { x: 560, y: 350, width: 160, height: 100 });
  await page.mouse.up();

  const e = await last(page);
  nearRect(rectOf(e), { x: 560, y: 350, width: 160, height: 100 });
  const sb = await page.evaluate((id) => (window as any).__CHALK__.getElementScreenBounds(id), e.id);
  nearRect(sb, { x: 544, y: 340, width: 192, height: 120 }, 1);
});
