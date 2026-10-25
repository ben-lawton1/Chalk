import {
  test,
  expect,
  TID,
  els,
  app,
  selected,
  last,
  freshBoard,
  draw,
  drag,
  shot,
  screenBounds,
  toScreen,
  toWorld,
  near,
  nearPt,
  nearRect,
} from './helpers';
import type { Page } from '@playwright/test';

const vp = async (page: Page) => (await app(page)).viewport;
const rectOf = (e: any) => ({ x: e.x, y: e.y, width: e.width, height: e.height });

test('VPT-1: the wheel pans; elements keep their world coordinates', async ({ page, request }) => {
  await freshBoard(page, request);
  await draw(page, 'r', { x: 500, y: 300 }, { x: 660, y: 400 });
  const r = await last(page);
  const world0 = rectOf(r);

  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => vp(page)).toEqual({ scrollX: 0, scrollY: -100, zoom: 1 });
  await page.mouse.wheel(100, 0);
  await expect.poll(async () => (await vp(page)).scrollX).toBe(-100);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 100);
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await vp(page)).scrollX).toBe(-200);
  expect((await vp(page)).scrollY).toBe(-100);

  expect(rectOf(await last(page))).toEqual(world0);
  nearRect((await screenBounds(page, r.id))!, { x: 300, y: 200, width: 160, height: 100 });
});

test('VPT-2: Ctrl+wheel zooms at the cursor, never the page', async ({ page, request }) => {
  await freshBoard(page, request);
  await page.mouse.move(700, 450);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await vp(page)).zoom).toBeGreaterThan(1);
  const z = (await vp(page)).zoom;
  expect(z).toBeLessThanOrEqual(1.2215);
  expect(z).toBeCloseTo(Math.exp(0.2), 3);
  nearPt(await toWorld(page, { x: 700, y: 450 }), { x: 700, y: 450 }, 0.01);

  await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await vp(page)).zoom).toBeLessThan(z);
  await page.keyboard.up('Control');
  near((await vp(page)).zoom, 1, 0.001);
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
});

test('VPT-3: the zoom buttons, keys and clamps', async ({ page, request }) => {
  await freshBoard(page, request);
  const zoom = async () => (await vp(page)).zoom;

  await page.getByTestId(TID.zoomIn).click();
  near(await zoom(), 1.2, 1e-9);
  await expect(page.getByTestId(TID.zoomReset)).toHaveText('120%');
  nearPt(await toWorld(page, { x: 640, y: 400 }), { x: 640, y: 400 }, 1e-6);

  await page.getByTestId(TID.zoomOut).click();
  near(await zoom(), 1, 1e-9);
  await expect(page.getByTestId(TID.zoomReset)).toHaveText('100%');

  await page.keyboard.press('Control+Equal');
  near(await zoom(), 1.2, 1e-9);
  await page.keyboard.press('Control+Minus');
  near(await zoom(), 1, 1e-9);

  await page.keyboard.press('Control+Equal');
  await page.keyboard.press('Control+Equal');
  near(await zoom(), 1.44, 1e-9);
  await page.keyboard.press('Control+Digit0');
  near(await zoom(), 1, 1e-9);

  await page.getByTestId(TID.zoomIn).click();
  await page.getByTestId(TID.zoomReset).click();
  near(await zoom(), 1, 1e-9);

  for (let i = 0; i < 20; i++) await page.keyboard.press('Control+Equal');
  near(await zoom(), 30, 1e-9);
  for (let i = 0; i < 40; i++) await page.keyboard.press('Control+Minus');
  near(await zoom(), 0.1, 1e-9);
});

test('VPT-4: Space+drag, middle-drag and the hand tool', async ({ page, request }) => {
  await freshBoard(page, request);
  await page.mouse.move(640, 400);
  await page.keyboard.down('Space');
  await expect(page.getByTestId(TID.canvasInteractive)).toHaveCSS('cursor', 'grab');
  await drag(page, { x: 640, y: 400 }, { x: 540, y: 350 });
  await page.keyboard.up('Space');
  expect(await vp(page)).toEqual({ scrollX: -100, scrollY: -50, zoom: 1 });
  expect(await els(page)).toEqual([]);
  expect((await app(page)).tool).toBe('select');

  await drag(page, { x: 640, y: 400 }, { x: 700, y: 450 }, { button: 'middle' });
  expect(await vp(page)).toEqual({ scrollX: -40, scrollY: 0, zoom: 1 });

  await page.keyboard.press('h');
  await drag(page, { x: 640, y: 400 }, { x: 600, y: 400 });
  expect((await vp(page)).scrollX).toBe(-80);
  expect((await app(page)).tool).toBe('hand');
  await page.keyboard.press('v');
  expect((await app(page)).tool).toBe('select');
});

test('VPT-5: drawing at zoom 1.2 maps through screenToWorld', async ({ page, request }) => {
  await freshBoard(page, request);
  await page.keyboard.press('Control+Equal');
  await expect.poll(async () => (await vp(page)).zoom).toBeCloseTo(1.2, 9);
  await draw(page, 'r', { x: 400, y: 300 }, { x: 592, y: 420 });
  const r = await last(page);
  nearRect(rectOf(r), { x: 440, y: 316.667, width: 160, height: 100 }, 0.05);
});

test('VPT-6: zoom to fit, and zoom to selection', async ({ page, request }) => {
  await freshBoard(page, request);
  await draw(page, 'r', { x: 300, y: 200 }, { x: 460, y: 300 });
  const A = (await last(page)).id;
  await draw(page, 'r', { x: 900, y: 550 }, { x: 1060, y: 650 });
  const B = (await last(page)).id;

  await page.mouse.wheel(0, 2000);
  await expect.poll(async () => (await vp(page)).scrollY).toBeLessThan(-1000);

  await page.getByTestId(TID.zoomFit).click();
  near((await vp(page)).zoom, 1.49333, 0.001);
  for (const id of [A, B]) {
    const b = (await screenBounds(page, id))!;
    expect(b.x).toBeGreaterThanOrEqual(63);
    expect(b.y).toBeGreaterThanOrEqual(63);
    expect(b.x + b.width).toBeLessThanOrEqual(1217);
    expect(b.y + b.height).toBeLessThanOrEqual(737);
  }
  // B is still selected, so the style panel would cover A's left edge: deselect first.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId(TID.stylePanel)).toBeHidden();
  await shot(page, 'viewport-fit');

  const p = await toScreen(page, { x: 300, y: 250 });
  await page.mouse.click(p.x, p.y);
  expect(await selected(page)).toEqual([A]);
  await page.keyboard.press('Shift+Digit2');
  near((await vp(page)).zoom, 2, 1e-6);
  const sb = (await screenBounds(page, A))!;
  nearPt({ x: sb.x + sb.width / 2, y: sb.y + sb.height / 2 }, { x: 640, y: 400 }, 1);

  await page.keyboard.press('Shift+Digit1');
  near((await vp(page)).zoom, 1.49333, 0.001);
});

test('VPT-7: scroll back to content', async ({ page, request }) => {
  await freshBoard(page, request);
  await draw(page, 'r', { x: 500, y: 300 }, { x: 660, y: 400 });
  const r = await last(page);
  await page.mouse.wheel(0, 3000);
  await expect(page.getByTestId(TID.scrollToContent)).toBeVisible();
  await page.getByTestId(TID.scrollToContent).click();
  near((await vp(page)).zoom, 1, 1e-9);
  const sb = (await screenBounds(page, r.id))!;
  nearPt({ x: sb.x + sb.width / 2, y: sb.y + sb.height / 2 }, { x: 640, y: 400 }, 1);
  await expect(page.getByTestId(TID.scrollToContent)).toBeHidden();
});
