// Terminal panel e2e. Runs against the `term-test` service (the Linux build of the bridge, CHALK_TERMINAL_URL on app-test).
import { test, expect, TID, app, freshBoard } from './helpers';
import type { Page } from '@playwright/test';

const activeRows = (page: Page) => page.locator(`[data-testid="${TID.terminalHost}"][data-active="true"] .xterm-rows`);
const tabs = (page: Page) => page.getByTestId(TID.terminalTab);
const stageHeight = async (page: Page): Promise<number> => (await app(page)).viewportSize.height;

async function openTerminal(page: Page): Promise<void> {
  await page.getByTestId(TID.terminalButton).click();
  await expect(page.getByTestId(TID.terminalPanel)).toBeVisible();
  await expect(tabs(page)).toHaveCount(1);
  await expect(tabs(page).first()).toHaveAttribute('data-status', 'running', { timeout: 15_000 });
}

test('TRM-1: the button opens the panel, the first tab connects and runs a command', async ({ page, request }) => {
  await freshBoard(page, request);
  await expect(page.getByTestId(TID.terminalPanel)).toBeHidden();
  const before = await stageHeight(page);

  await openTerminal(page);
  await expect(tabs(page).first()).toContainText('Shell');
  await expect(page.getByTestId(TID.terminalButton)).toHaveAttribute('aria-pressed', 'true');

  // the stage shrinks by the panel height
  await expect.poll(() => stageHeight(page)).toBeLessThan(before);
  const panel = await page.getByTestId(TID.terminalPanel).boundingBox();
  expect(panel).not.toBeNull();
  expect(await stageHeight(page)).toBe(before - Math.round(panel!.height));

  // the prefs are remembered
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('chalk:terminal') ?? 'null'));
  expect(prefs.open).toBe(true);

  await page.keyboard.type('echo chalk-$((40+2))');
  await page.keyboard.press('Enter');
  await expect(activeRows(page)).toContainText('chalk-42');
});

test('TRM-2: + opens a second tab, x closes it, Ctrl+` hides the panel and the stage grows, reopening keeps the session', async ({ page, request }) => {
  await freshBoard(page, request);
  const full = await stageHeight(page);
  await openTerminal(page);
  await page.keyboard.type('echo chalk-$((40+2))');
  await page.keyboard.press('Enter');
  await expect(activeRows(page)).toContainText('chalk-42');

  await page.getByTestId(TID.terminalNew).click();
  await expect(tabs(page)).toHaveCount(2);
  await expect(tabs(page).nth(1)).toHaveAttribute('data-active', 'true');
  await expect(tabs(page).nth(1)).toHaveAttribute('data-status', 'running', { timeout: 15_000 });
  await expect(activeRows(page)).not.toContainText('chalk-42');

  // switch back and forth: each tab keeps its own screen
  await tabs(page).first().click();
  await expect(activeRows(page)).toContainText('chalk-42');

  await tabs(page).nth(1).getByTestId(TID.terminalTabClose).click();
  await expect(tabs(page)).toHaveCount(1);
  await expect(activeRows(page)).toContainText('chalk-42');

  // Ctrl+` from inside the terminal hides the panel (sessions stay alive) and the stage grows back
  await page.keyboard.press('Control+Backquote');
  await expect(page.getByTestId(TID.terminalPanel)).toBeHidden();
  await expect.poll(() => stageHeight(page)).toBe(full);

  // ... and from anywhere else brings it back with the first session's output intact
  await page.keyboard.press('Control+Backquote');
  await expect(page.getByTestId(TID.terminalPanel)).toBeVisible();
  await expect(tabs(page)).toHaveCount(1);
  await expect(activeRows(page)).toContainText('chalk-42');
  await expect.poll(() => stageHeight(page)).toBeLessThan(full);
});

test('TRM-3: the top edge resizes within the limits and the height is remembered', async ({ page, request }) => {
  await freshBoard(page, request);
  await openTerminal(page);
  const h0 = Math.round((await page.getByTestId(TID.terminalPanel).boundingBox())!.height);

  const grip = (await page.getByTestId(TID.terminalResize).boundingBox())!;
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 100, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await page.getByTestId(TID.terminalPanel).boundingBox())!.height)).toBe(h0 + 100);

  // far beyond the limits: clamped to 70% of the window, then to the 120px minimum
  const grip2 = (await page.getByTestId(TID.terminalResize).boundingBox())!;
  await page.mouse.move(grip2.x + 50, grip2.y + 4);
  await page.mouse.down();
  await page.mouse.move(grip2.x + 50, 0, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await page.getByTestId(TID.terminalPanel).boundingBox())!.height)).toBe(Math.floor(800 * 0.7));
  const grip3 = (await page.getByTestId(TID.terminalResize).boundingBox())!;
  await page.mouse.move(grip3.x + 50, grip3.y + 4);
  await page.mouse.down();
  await page.mouse.move(grip3.x + 50, 790, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await page.getByTestId(TID.terminalPanel).boundingBox())!.height)).toBe(120);

  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('chalk:terminal') ?? 'null'));
  expect(prefs).toEqual({ open: true, height: 120 });
});

test('TRM-4: a persisted open panel reconnects after a reload; minimise keeps sessions, kill all ends them', async ({ page, request }) => {
  const id = await freshBoard(page, request);
  await openTerminal(page);
  await page.getByTestId(TID.terminalMinimise).click();
  await expect(page.getByTestId(TID.terminalPanel)).toBeHidden();
  await page.getByTestId(TID.terminalButton).click();
  await expect(tabs(page)).toHaveCount(1);

  await page.reload();
  await expect(page.getByTestId(TID.terminalPanel)).toBeVisible();
  await expect(tabs(page)).toHaveCount(1);
  await expect(tabs(page).first()).toHaveAttribute('data-status', 'running', { timeout: 15_000 });
  expect((await app(page)).boardId).toBe(id);

  await page.getByTestId(TID.terminalKillAll).click();
  await expect(page.getByTestId(TID.terminalPanel)).toBeHidden();
  await page.getByTestId(TID.terminalButton).click();
  await expect(tabs(page)).toHaveCount(1); // a fresh session
  await expect(tabs(page).first()).toHaveAttribute('data-status', 'running', { timeout: 15_000 });
});

test('TRM-5: when the shell exits the tab says so and Restart starts a new one', async ({ page, request }) => {
  await freshBoard(page, request);
  await openTerminal(page);
  await page.keyboard.type('exit 3');
  await page.keyboard.press('Enter');
  await expect(tabs(page).first()).toHaveAttribute('data-status', 'exited');
  await expect(page.getByTestId(TID.terminalEnded)).toContainText('[process exited with code 3]');
  await expect(activeRows(page)).toContainText('[process exited with code 3]');
  await expect(tabs(page)).toHaveCount(1); // the tab stays until closed

  await page.getByTestId(TID.terminalRestart).click();
  await expect(tabs(page).first()).toHaveAttribute('data-status', 'running', { timeout: 15_000 });
  await expect(page.getByTestId(TID.terminalEnded)).toBeHidden();
  await page.keyboard.type('echo again-$((1+1))');
  await page.keyboard.press('Enter');
  await expect(activeRows(page)).toContainText('again-2');
});

test('TRM-6: Ctrl+S and zoom keys inside the terminal do not reach the app', async ({ page, request }) => {
  await freshBoard(page, request);
  await openTerminal(page);
  const zoom = (await app(page)).viewport.zoom;
  await page.keyboard.press('Control+=');
  await page.keyboard.press('Control+s');
  expect((await app(page)).viewport.zoom).toBe(zoom);
  await expect(page.getByTestId(TID.toast)).toBeHidden();
});

test('TRM-7: with the bridge unreachable the panel explains how to start it, and offers Retry', async ({ page, request }) => {
  await page.route('**/api/config', (route) => route.fulfill({ json: { terminalUrl: 'http://127.0.0.1:1' } }));
  await freshBoard(page, request);
  await page.getByTestId(TID.terminalButton).click();
  await expect(page.getByTestId(TID.terminalOffline)).toBeVisible();
  await expect(page.getByTestId(TID.terminalOffline)).toContainText("isn't running");
  await expect(page.getByTestId(TID.terminalOffline)).toContainText('chalk-terminal.exe');
  await expect(page.getByTestId(TID.terminalRetry)).toBeVisible();
  await expect(tabs(page)).toHaveCount(0);

  // Retry while still down keeps the message
  await page.getByTestId(TID.terminalRetry).click();
  await expect(page.getByTestId(TID.terminalOffline)).toBeVisible();

  // the page still works: the panel is just a panel
  await page.getByTestId(TID.terminalMinimise).click();
  await expect(page.getByTestId(TID.terminalPanel)).toBeHidden();
});
