import * as fs from 'node:fs';
import {
  test,
  expect,
  TID,
  els,
  app,
  selected,
  freshBoard,
  draw,
  menu,
  download,
  scene,
  rectEl,
  textEl,
  arrowEl,
  nearPt,
  near,
} from './helpers';
import type { Page } from '@playwright/test';

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

const editor = (page: Page) => page.getByTestId(TID.textEditor);

async function importFile(page: Page, name: string, content: string | object): Promise<void> {
  const buffer = Buffer.from(typeof content === 'string' ? content : JSON.stringify(content));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), menu(page, TID.menuImport)]);
  await chooser.setFiles({ name, mimeType: 'application/json', buffer });
}

test('EXP-1: export JSON', async ({ page, request }) => {
  await freshBoard(page, request, 'Export test');
  await draw(page, 'r', { x: 400, y: 250 }, { x: 560, y: 350 });
  await page.mouse.dblclick(700, 500);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type('Note');
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();

  const dl = await download(page, TID.menuExportJson);
  expect(dl.suggestedFilename()).toBe('Export-test.chalk.json');
  const text = fs.readFileSync(await dl.path(), 'utf8');
  expect(text).toContain('\n  "type": "chalk/scene"');
  const parsed = JSON.parse(text);
  expect(parsed).toEqual({ type: 'chalk/scene', version: 1, elements: await els(page) });
  expect(parsed.elements).toHaveLength(2);
});

test('EXP-2: import JSON replaces the scene, resolves bindings, fits the view, one undo step', async ({
  page,
  request,
}) => {
  await freshBoard(page, request);
  await draw(page, 'r', { x: 400, y: 250 }, { x: 560, y: 350 });
  const original = await els(page);
  expect(original).toHaveLength(1);

  await importFile(
    page,
    'diagram.chalk.json',
    scene([
      rectEl('impA', 300, 300, 160, 100),
      rectEl('impB', 800, 300, 160, 100),
      arrowEl('impArrow', { x: 0, y: 0 }, { x: 1, y: 1 }, 'impA', 'impB'),
      { type: 'star' },
      textEl('blank', 0, 0, '   '),
    ]),
  );
  await expect.poll(async () => (await els(page)).map((e) => e.id)).toEqual(['impA', 'impB', 'impArrow']);
  const all = await els(page);
  const arrow = all.find((e) => e.id === 'impArrow');
  nearPt(arrow.start, { x: 466, y: 350 });
  nearPt(arrow.end, { x: 794, y: 350 });
  expect(arrow.startBinding.elementId).toBe('impA');
  expect(arrow.endBinding.elementId).toBe('impB');
  for (const e of all) {
    expect(Number.isInteger(e.seed)).toBe(true);
    expect(e.seed).toBeGreaterThanOrEqual(1);
    expect(e.style).toEqual(DEFAULT_STYLE);
  }
  expect(await selected(page)).toEqual([]);
  near((await app(page)).viewport.zoom, 1152 / 660, 0.001);

  await page.keyboard.press('Control+z');
  expect(await els(page)).toEqual(original);
  await page.keyboard.press('Control+Shift+z');
  expect((await els(page)).map((e) => e.id)).toEqual(['impA', 'impB', 'impArrow']);
});

test('EXP-3: import errors leave the scene untouched', async ({ page, request }) => {
  await freshBoard(page, request);
  await draw(page, 'r', { x: 400, y: 250 }, { x: 560, y: 350 });
  const before = await els(page);
  const toast = page.getByTestId(TID.toast);

  const cases: Array<[string, string, string[]]> = [
    ['not json', 'bad.chalk.json', ['Could not import', 'File is not valid JSON']],
    [
      JSON.stringify({ type: 'chalk/scene', version: 99, elements: [] }),
      'future.chalk.json',
      ['Could not import: This file was made by a newer Chalk'],
    ],
    [JSON.stringify({ type: 'other' }), 'other.chalk.json', ['Could not import']],
  ];

  let previous = '';
  for (const [content, name, expected] of cases) {
    await importFile(page, name, content);
    await expect.poll(async () => (await toast.textContent()) ?? '').not.toBe(previous);
    await expect(toast).toHaveClass(/toast-error/);
    for (const part of expected) await expect(toast).toContainText(part);
    previous = (await toast.textContent()) ?? '';
    expect(await els(page)).toEqual(before);
  }
});

test('EXP-4: PNG export: 2x scale, 32px padding, white background', async ({ page, request }) => {
  await freshBoard(page, request, 'Export test');
  await draw(page, 'r', { x: 400, y: 250 }, { x: 560, y: 350 });
  const dl = await download(page, TID.menuExportPng);
  expect(dl.suggestedFilename()).toBe('Export-test.png');
  await dl.saveAs('artifacts/screens/export.png');
  const buf = fs.readFileSync('artifacts/screens/export.png');
  expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(buf.readUInt32BE(16)).toBe(448);
  expect(buf.readUInt32BE(20)).toBe(328);
});

test('EXP-5: exporting an empty board', async ({ page, request }) => {
  await freshBoard(page, request);
  let downloads = 0;
  page.on('download', () => downloads++);
  await menu(page, TID.menuExportPng);
  await expect(page.getByTestId(TID.toast)).toHaveText('Nothing to export');
  expect(downloads).toBe(0);
});

