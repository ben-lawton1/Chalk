import { test, expect, TID, tidTool, els, app, selected, last, freshBoard, draw, drag, shot, nearRect } from './helpers';

const DEFAULT_STYLE = {
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  fillStyle: 'hachure',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 1,
  opacity: 100,
  edges: 'round',
  fontSize: 24,
  fontFamily: 'hand',
  textAlign: 'left',
  startArrowhead: 'none',
  endArrowhead: 'arrow',
};

const rectOf = (e: any) => ({ x: e.x, y: e.y, width: e.width, height: e.height });

test('SHP-1: each kind by click-drag', async ({ page, request }) => {
  await freshBoard(page, request);
  await expect(page.getByTestId(TID.welcomeHint)).toBeVisible();

  await draw(page, 'r', { x: 360, y: 200 }, { x: 520, y: 300 });
  const rect = await last(page);
  expect(rect.type).toBe('shape');
  expect(rect.shape).toBe('rectangle');
  nearRect(rectOf(rect), { x: 360, y: 200, width: 160, height: 100 });
  expect(rect.label).toBe('');
  expect(rect.style).toEqual(DEFAULT_STYLE);
  expect(rect.id).toMatch(/^[A-Za-z0-9]{12}$/);
  expect(Number.isInteger(rect.seed)).toBe(true);
  expect(rect.seed).toBeGreaterThanOrEqual(1);
  expect(rect.seed).toBeLessThanOrEqual(2 ** 31 - 2);
  expect(await selected(page)).toEqual([rect.id]);
  expect((await app(page)).tool).toBe('select');
  await expect(page.getByTestId(TID.welcomeHint)).toBeHidden();

  await draw(page, 'd', { x: 600, y: 200 }, { x: 760, y: 320 });
  const diamond = await last(page);
  expect(diamond.shape).toBe('diamond');
  nearRect(rectOf(diamond), { x: 600, y: 200, width: 160, height: 120 });

  await draw(page, 'o', { x: 360, y: 400 }, { x: 520, y: 500 });
  const ellipse = await last(page);
  expect(ellipse.shape).toBe('ellipse');
  nearRect(rectOf(ellipse), { x: 360, y: 400, width: 160, height: 100 });

  await draw(page, '5', { x: 600, y: 400 }, { x: 740, y: 520 });
  const tri = await last(page);
  expect(tri.shape).toBe('triangle');
  nearRect(rectOf(tri), { x: 600, y: 400, width: 140, height: 120 });

  const all = await els(page);
  expect(all.map((e) => e.shape)).toEqual(['rectangle', 'diamond', 'ellipse', 'triangle']);
  expect(new Set(all.map((e) => e.id)).size).toBe(4);

  await shot(page, 'shapes');

  for (let i = 0; i < 4; i++) await page.keyboard.press('Control+z');
  expect(await els(page)).toEqual([]);
  for (let i = 0; i < 4; i++) await page.keyboard.press('Control+Shift+z');
  expect(await els(page)).toEqual(all);
});

test('SHP-2: a reverse drag normalizes', async ({ page, request }) => {
  await freshBoard(page, request);
  await draw(page, 'r', { x: 520, y: 300 }, { x: 360, y: 200 });
  const r = await last(page);
  nearRect(rectOf(r), { x: 360, y: 200, width: 160, height: 100 });
  expect(r.width).toBeGreaterThan(0);
  expect(r.height).toBeGreaterThan(0);
});

test('SHP-3: click to place (default size, centered on the click)', async ({ page, request }) => {
  await freshBoard(page, request);

  await page.keyboard.press('o');
  await page.mouse.click(700, 400);
  let e = await last(page);
  expect(e.shape).toBe('ellipse');
  nearRect(rectOf(e), { x: 620, y: 350, width: 160, height: 100 });
  expect(await selected(page)).toEqual([e.id]);
  expect((await app(page)).tool).toBe('select');

  await page.keyboard.press('r');
  await page.mouse.click(450, 250);
  e = await last(page);
  expect(e.shape).toBe('rectangle');
  nearRect(rectOf(e), { x: 370, y: 200, width: 160, height: 100 });

  await page.keyboard.press('5');
  await page.mouse.click(800, 550);
  e = await last(page);
  expect(e.shape).toBe('triangle');
  nearRect(rectOf(e), { x: 730, y: 490, width: 140, height: 120 });
});

test('SHP-4: Shift draws a square or circle', async ({ page, request }) => {
  await freshBoard(page, request);
  await draw(page, 'r', { x: 400, y: 300 }, { x: 500, y: 370 }, ['Shift']);
  nearRect(rectOf(await last(page)), { x: 400, y: 300, width: 100, height: 100 });
  await draw(page, 'o', { x: 600, y: 300 }, { x: 680, y: 420 }, ['Shift']);
  nearRect(rectOf(await last(page)), { x: 600, y: 300, width: 120, height: 120 });
});

test('SHP-5: Alt draws from the center', async ({ page, request }) => {
  await freshBoard(page, request);
  await draw(page, 'r', { x: 640, y: 400 }, { x: 700, y: 440 }, ['Alt']);
  nearRect(rectOf(await last(page)), { x: 580, y: 360, width: 120, height: 80 });
});

test('SHP-6: tool buttons, digit keys and the tool lock', async ({ page, request }) => {
  await freshBoard(page, request);

  await page.getByTestId(tidTool('triangle')).click();
  expect((await app(page)).tool).toBe('triangle');
  await expect(page.getByTestId(tidTool('triangle'))).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(TID.hintBar)).toContainText('Click and drag to draw');

  await page.keyboard.press('3');
  expect((await app(page)).tool).toBe('diamond');
  await page.keyboard.press('v');
  expect((await app(page)).tool).toBe('select');

  await page.getByTestId(TID.toolLock).click();
  expect((await app(page)).toolLocked).toBe(true);
  await expect(page.getByTestId(TID.toolLock)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('q');
  expect((await app(page)).toolLocked).toBe(false);
  await page.keyboard.press('q');
  expect((await app(page)).toolLocked).toBe(true);

  await page.keyboard.press('r');
  await drag(page, { x: 350, y: 200 }, { x: 450, y: 260 });
  expect((await app(page)).tool).toBe('rectangle');
  await drag(page, { x: 500, y: 200 }, { x: 600, y: 260 });
  expect((await app(page)).tool).toBe('rectangle');
  expect(await els(page)).toHaveLength(2);

  await page.keyboard.press('q');
  expect((await app(page)).toolLocked).toBe(false);
  await page.keyboard.press('Escape');
  expect(await selected(page)).toEqual([]);
  expect((await app(page)).tool).toBe('rectangle');
  await page.keyboard.press('Escape');
  expect((await app(page)).tool).toBe('select');
});
