// Embed mode (Atlas contract D13). The parent is a fake host page at http://embed-host.test:9000 (served through page.route),
// which is the origin app-test is configured with in CHALK_EMBED_ORIGINS (compose.test.yaml).
import { test, expect, TID, tidNotebook, newBoard, app, waitReady } from './helpers';
import type { Page } from '@playwright/test';

const HOST = 'http://embed-host.test:9000';

// Chrome's Local Network Access check would block a "public" page (the fake host) from framing the private app-test, so turn it off for this spec.
test.use({ launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'] } });

async function openHost(page: Page, query: string): Promise<void> {
  await page.route(`${HOST}/**`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>host</title><iframe id="f" src="http://app-test:8000/${query}" style="width:1200px;height:700px"></iframe>
<script>
  window.__msgs = [];
  window.addEventListener('message', (e) => window.__msgs.push({ origin: e.origin, data: e.data }));
  window.__send = (m) => document.getElementById('f').contentWindow.postMessage(m, 'http://app-test:8000');
</script>`,
    }),
  );
  await page.goto(`${HOST}/`);
}

const msgs = (page: Page): Promise<{ origin: string; data: any }[]> => page.evaluate(() => (window as any).__msgs);
const ofType = async (page: Page, type: string) => (await msgs(page)).filter((m) => m.data?.type === type);

test('EMB-1: embedded Chalk opens ?board=, starts with the sidebar closed, and talks to the parent', async ({ page, request }) => {
  const a = await newBoard(request, { name: 'Embed A' });
  const b = await newBoard(request, { name: 'Embed B' });
  await openHost(page, `?board=${a.id}&embed=1`);
  const chalk = page.frameLocator('#f');
  await expect(chalk.getByTestId(TID.sidebar)).toHaveAttribute('data-open', 'false');

  await expect.poll(async () => (await ofType(page, 'chalk:ready')).length).toBe(1);
  await expect.poll(async () => (await ofType(page, 'chalk:board')).map((m) => m.data.id)).toEqual([a.id]);
  const board = (await ofType(page, 'chalk:board'))[0]!;
  expect(board.origin).toBe('http://app-test:8000');
  expect(board.data).toEqual({ source: 'chalk', type: 'chalk:board', id: a.id, name: 'Embed A' });
  expect((await ofType(page, 'chalk:ready'))[0]!.data).toEqual({ source: 'chalk', type: 'chalk:ready' });
  await expect.poll(async () => (await ofType(page, 'chalk:sidebar')).map((m) => m.data.open)).toEqual([false]);

  // toggle opens the sidebar and reports it
  await page.evaluate(() => (window as any).__send({ source: 'atlas', type: 'chalk:toggle-sidebar' }));
  await expect(chalk.getByTestId(TID.sidebar)).toHaveAttribute('data-open', 'true');
  await expect.poll(async () => (await ofType(page, 'chalk:sidebar')).map((m) => m.data.open)).toEqual([false, true]);

  // set-sidebar closes it
  await page.evaluate(() => (window as any).__send({ source: 'atlas', type: 'chalk:set-sidebar', open: false }));
  await expect(chalk.getByTestId(TID.sidebar)).toHaveAttribute('data-open', 'false');
  await expect.poll(async () => (await ofType(page, 'chalk:sidebar')).map((m) => m.data.open)).toEqual([false, true, false]);

  // a message with the wrong source is ignored
  await page.evaluate(() => (window as any).__send({ source: 'other', type: 'chalk:toggle-sidebar' }));
  await page.waitForTimeout(300);
  await expect(chalk.getByTestId(TID.sidebar)).toHaveAttribute('data-open', 'false');

  // open-board switches pages and reports the new one
  await page.evaluate((id) => (window as any).__send({ source: 'atlas', type: 'chalk:open-board', id }), b.id);
  await expect.poll(async () => (await ofType(page, 'chalk:board')).map((m) => m.data.id)).toEqual([a.id, b.id]);
  expect((await ofType(page, 'chalk:board'))[1]!.data.name).toBe('Embed B');

  // an unknown id keeps the current page and shows a toast
  await page.evaluate(() => (window as any).__send({ source: 'atlas', type: 'chalk:open-board', id: 'missing00000' }));
  await expect(chalk.getByTestId(TID.toast)).toHaveText('Page not found');
  expect(await ofType(page, 'chalk:board')).toHaveLength(2);
});

test('EMB-2: standalone ?board= opens that page, and the sidebar is open without embed=1', async ({ page, request }) => {
  await newBoard(request, { name: 'Other' });
  const b = await newBoard(request, { name: 'Target' });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('chalk:sidebar', JSON.stringify({ open: true, expanded: [] }));
    } catch {
      /* storage unavailable */
    }
  });
  await page.goto(`/?board=${b.id}`);
  await expect.poll(async () => (await app(page)).boardId).toBe(b.id);
  await expect(page.getByTestId(TID.sidebar)).toHaveAttribute('data-open', 'true');
});

test('EMB-3: library-changed both ways, and Ctrl+backquote is forwarded (D24)', async ({ page, request }) => {
  const a = await newBoard(request, { name: 'Sync A' });
  await openHost(page, `?board=${a.id}&embed=1`);
  const chalk = page.frameLocator('#f');
  await expect.poll(async () => (await ofType(page, 'chalk:ready')).length).toBe(1);
  await page.evaluate(() => (window as any).__send({ source: 'atlas', type: 'chalk:set-sidebar', open: true }));
  await expect(chalk.getByTestId(TID.sidebar)).toHaveAttribute('data-open', 'true');

  // Chalk's own sidebar change is announced to the parent (and nothing was announced before it)
  expect(await ofType(page, 'chalk:library-changed')).toHaveLength(0);
  await chalk.getByTestId(TID.sidebarNewNotebook).click();
  await expect.poll(async () => (await ofType(page, 'chalk:library-changed')).length).toBeGreaterThan(0);
  const evt = (await ofType(page, 'chalk:library-changed'))[0]!;
  expect(evt.origin).toBe('http://app-test:8000');
  expect(evt.data).toEqual({ source: 'chalk', type: 'chalk:library-changed' });

  // Atlas changed the library: a new notebook shows up after library-changed, and no echo goes back
  const nb = `FromAtlas${Date.now()}`;
  const res = await request.post('/api/notebooks', { data: { name: nb } });
  expect(res.status()).toBe(201);
  const before = (await ofType(page, 'chalk:library-changed')).length;
  await page.evaluate(() => (window as any).__send({ source: 'atlas', type: 'chalk:library-changed' }));
  await expect(chalk.getByTestId(tidNotebook(nb))).toBeVisible();
  await page.waitForTimeout(300);
  expect(await ofType(page, 'chalk:library-changed')).toHaveLength(before);

  // The open page was deleted from Atlas: toast, then another page opens
  const doomed = await newBoard(request, { name: 'Doomed' });
  await page.evaluate((id) => (window as any).__send({ source: 'atlas', type: 'chalk:open-board', id }), doomed.id);
  await expect.poll(async () => (await ofType(page, 'chalk:board')).map((m) => m.data.id).includes(doomed.id)).toBe(true);
  expect((await request.delete(`/api/boards/${doomed.id}`)).status()).toBe(204);
  await page.evaluate(() => (window as any).__send({ source: 'atlas', type: 'chalk:library-changed' }));
  await expect(chalk.getByTestId(TID.toast)).toHaveText('Page not found');
  await expect.poll(async () => (await ofType(page, 'chalk:board')).at(-1)!.data.id).not.toBe(doomed.id);

  // Ctrl+` inside embedded Chalk goes to the parent
  await chalk.getByTestId(TID.sidebarCollapse).click();
  expect(await ofType(page, 'chalk:toggle-terminal')).toHaveLength(0);
  await page.keyboard.press('Control+Backquote');
  await expect.poll(async () => (await ofType(page, 'chalk:toggle-terminal')).length).toBe(1);
  expect((await ofType(page, 'chalk:toggle-terminal'))[0]!.data).toEqual({ source: 'chalk', type: 'chalk:toggle-terminal' });
});

test('EMB-4: standalone Chalk ignores Ctrl+backquote and has no terminal', async ({ page, request }) => {
  await newBoard(request, { name: 'Plain' });
  await page.goto('/');
  await waitReady(page);
  await page.keyboard.press('Control+Backquote');
  await expect(page.locator('.terminal-panel, .terminal-button')).toHaveCount(0);
  expect(((await (await request.get('/api/config')).json()) as Record<string, unknown>).terminalUrl).toBeUndefined();
});
