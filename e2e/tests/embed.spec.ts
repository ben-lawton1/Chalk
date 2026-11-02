// Embed mode (Atlas contract D13). The parent is a fake host page at http://embed-host.test:9000 (served through page.route),
// which is the origin app-test is configured with in CHALK_EMBED_ORIGINS (compose.test.yaml).
import { test, expect, TID, newBoard, app } from './helpers';
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
