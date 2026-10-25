import {
  test,
  expect,
  TID,
  tidStroke,
  tidBg,
  tidFill,
  tidWidth,
  tidStrokeStyle,
  tidRoughness,
  tidEdges,
  tidFontSize,
  tidFont,
  tidAlign,
  tidStartHead,
  tidEndHead,
  els,
  app,
  selected,
  byId,
  last,
  freshBoard,
  draw,
  drag,
  shot,
} from './helpers';
import type { Page } from '@playwright/test';

const tid = (page: Page, id: string) => page.getByTestId(id);
const editor = (page: Page) => page.getByTestId(TID.textEditor);

test('STY-1: panel visibility and sections', async ({ page, request }) => {
  await freshBoard(page, request);
  await expect(tid(page, TID.stylePanel)).toBeHidden();

  await page.keyboard.press('r');
  await expect(tid(page, TID.stylePanel)).toBeVisible();
  for (const id of [
    tidStroke(0),
    tidBg(0),
    tidFill('hachure'),
    tidWidth(2),
    tidStrokeStyle('solid'),
    tidRoughness(1),
    tidEdges('round'),
    tidFontSize(24),
    tidFont('hand'),
    TID.opacity,
  ]) {
    await expect(tid(page, id), id).toBeVisible();
  }
  for (const id of [tidAlign('left'), tidStartHead('none'), TID.actionDelete]) {
    await expect(tid(page, id), id).toHaveCount(0);
  }

  await page.keyboard.press('l');
  await expect(tid(page, tidStartHead('none'))).toHaveCount(0);
  await expect(tid(page, tidWidth(2))).toBeVisible();

  await page.keyboard.press('a');
  await expect(tid(page, tidStartHead('none'))).toBeVisible();
  await expect(tid(page, tidEndHead('arrow'))).toBeVisible();

  await page.keyboard.press('t');
  await expect(tid(page, tidAlign('left'))).toBeVisible();
  await expect(tid(page, tidBg(0))).toHaveCount(0);

  await page.keyboard.press('Escape');
  expect((await app(page)).tool).toBe('select');
  await expect(tid(page, TID.stylePanel)).toBeHidden();

  await draw(page, 'r', { x: 400, y: 250 }, { x: 560, y: 350 });
  for (const id of [TID.actionDelete, TID.actionFront, TID.actionDuplicate]) {
    await expect(tid(page, id), id).toBeVisible();
  }

  // The whole panel (including the Layers row) must fit between the top bar and the bottom controls.
  const panel = (await tid(page, TID.stylePanel).boundingBox())!;
  const del = (await tid(page, TID.actionDelete).boundingBox())!;
  const zoom = (await tid(page, TID.zoomReset).boundingBox())!;
  expect(panel.y + panel.height).toBeLessThanOrEqual(zoom.y);
  expect(del.y + del.height).toBeLessThanOrEqual(panel.y + panel.height);
  expect(del.y + del.height).toBeLessThanOrEqual(zoom.y);
  expect(await tid(page, TID.stylePanel).evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
});

test('STY-2: every control applies to the selection and becomes sticky', async ({ page, request }) => {
  await freshBoard(page, request);
  await draw(page, 'r', { x: 400, y: 250 }, { x: 560, y: 350 });
  const R = (await last(page)).id;
  const style = async () => (await byId(page, R)).style;
  const pressed = (id: string) => expect(tid(page, id), id).toHaveAttribute('aria-pressed', 'true');

  await tid(page, tidStroke(1)).click();
  expect((await style()).strokeColor).toBe('#e03131');
  await pressed(tidStroke(1));
  await expect(tid(page, tidStroke(0))).toHaveAttribute('aria-pressed', 'false');

  await tid(page, tidBg(3)).click();
  expect((await style()).backgroundColor).toBe('#a5d8ff');
  await pressed(tidBg(3));

  await tid(page, tidFill('cross-hatch')).click();
  expect((await style()).fillStyle).toBe('cross-hatch');
  await tid(page, tidFill('solid')).click();
  expect((await style()).fillStyle).toBe('solid');
  await pressed(tidFill('solid'));

  await tid(page, tidWidth(4)).click();
  expect((await style()).strokeWidth).toBe(4);
  await pressed(tidWidth(4));

  await tid(page, tidStrokeStyle('dashed')).click();
  expect((await style()).strokeStyle).toBe('dashed');
  await pressed(tidStrokeStyle('dashed'));

  await tid(page, tidRoughness(0)).click();
  expect((await style()).roughness).toBe(0);
  await pressed(tidRoughness(0));

  await tid(page, tidEdges('sharp')).click();
  expect((await style()).edges).toBe('sharp');
  await pressed(tidEdges('sharp'));

  await tid(page, TID.opacity).fill('50');
  await tid(page, TID.opacity).blur();
  expect((await style()).opacity).toBe(50);

  await tid(page, TID.strokeCustom).fill('#123456');
  await tid(page, TID.strokeCustom).blur();
  expect((await style()).strokeColor).toBe('#123456');

  // sticky: the next shape picks everything up
  await page.keyboard.press('Escape');
  expect(await selected(page)).toEqual([]);
  await draw(page, 'o', { x: 650, y: 250 }, { x: 810, y: 350 });
  const ell = await last(page);
  expect(ell.style).toMatchObject({
    strokeColor: '#123456',
    backgroundColor: '#a5d8ff',
    fillStyle: 'solid',
    strokeWidth: 4,
    strokeStyle: 'dashed',
    roughness: 0,
    opacity: 50,
  });
  await shot(page, 'styles');

  // with the rectangle tool armed and nothing selected, a swatch only changes the defaults
  await page.keyboard.press('Escape');
  await page.keyboard.press('r');
  const before = await els(page);
  await tid(page, tidStroke(2)).click();
  expect(await els(page)).toEqual(before);
  await drag(page, { x: 400, y: 450 }, { x: 560, y: 550 });
  expect((await last(page)).style.strokeColor).toBe('#2f9e44');
});

test('STY-3: text and arrow styles', async ({ page, request }) => {
  await freshBoard(page, request);
  await page.mouse.dblclick(500, 300);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type('Style me');
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();
  const T = (await last(page)).id;

  await tid(page, tidFontSize(48)).click();
  let t = await byId(page, T);
  expect(t.style.fontSize).toBe(48);
  expect(t.height).toBeCloseTo(60, 1);
  await tid(page, tidFont('mono')).click();
  expect((await byId(page, T)).style.fontFamily).toBe('mono');
  await tid(page, tidAlign('center')).click();
  expect((await byId(page, T)).style.textAlign).toBe('center');

  await page.keyboard.press('a');
  await drag(page, { x: 400, y: 500 }, { x: 700, y: 500 });
  const arrow = await last(page);
  expect(arrow.type).toBe('arrow');
  await tid(page, tidStartHead('triangle')).click();
  expect((await byId(page, arrow.id)).style.startArrowhead).toBe('triangle');
  await tid(page, tidEndHead('none')).click();
  expect((await byId(page, arrow.id)).style.endArrowhead).toBe('none');
});

test('STY-4: undo/redo buttons and keys, redo clearing, slider merging, no undo while editing', async ({
  page,
  request,
}) => {
  await freshBoard(page, request);
  await expect(tid(page, TID.undo)).toBeDisabled();
  await expect(tid(page, TID.redo)).toBeDisabled();

  await draw(page, 'r', { x: 400, y: 250 }, { x: 560, y: 350 });
  const R = (await last(page)).id;
  await expect(tid(page, TID.undo)).toBeEnabled();
  await expect(tid(page, TID.redo)).toBeDisabled();

  await tid(page, tidStroke(1)).click();
  await tid(page, tidBg(1)).click();
  await tid(page, TID.undo).click();
  let s = (await byId(page, R)).style;
  expect(s.backgroundColor).toBe('transparent');
  expect(s.strokeColor).toBe('#e03131');
  await tid(page, TID.undo).click();
  expect((await byId(page, R)).style.strokeColor).toBe('#1e1e1e');
  await expect(tid(page, TID.redo)).toBeEnabled();

  await tid(page, TID.redo).click();
  expect((await byId(page, R)).style.strokeColor).toBe('#e03131');
  await page.keyboard.press('Control+y');
  expect((await byId(page, R)).style.backgroundColor).toBe('#ffc9c9');
  await expect(tid(page, TID.redo)).toBeDisabled();

  await page.keyboard.press('Control+z');
  await expect(tid(page, TID.redo)).toBeEnabled();
  await tid(page, tidWidth(1)).click();
  await expect(tid(page, TID.redo)).toBeDisabled();

  // slider changes in quick succession merge into one undo step
  const op = tid(page, TID.opacity);
  await op.fill('80');
  await op.fill('60');
  await op.fill('40');
  await op.blur();
  expect((await byId(page, R)).style.opacity).toBe(40);
  await page.keyboard.press('Control+z');
  expect((await byId(page, R)).style.opacity).toBe(100);

  // undo is a no-op while editing
  await page.mouse.dblclick(700, 500);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type('x');
  const countBefore = (await els(page)).length;
  await tid(page, TID.undo).click();
  expect((await app(page)).editingId).not.toBeNull();
  expect(await els(page)).toHaveLength(countBefore);
  const textId = (await app(page)).editingId;
  expect(await byId(page, textId)).toBeDefined();
  await page.keyboard.press('Escape');
});
