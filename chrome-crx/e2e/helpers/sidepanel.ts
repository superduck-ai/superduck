import type { BrowserContext, Page, Worker } from '@playwright/test';

export interface OpenSidepanelOptions {
  initialTabId?: number;
  skipPermissions?: boolean;
}

/**
 * Open the extension's sidepanel. If `initialTabId` is given, embed it
 * in the URL so `useQueryState` / `useActiveTabId` resolve to that tab
 * even when Playwright's `bringToFront` doesn't fire a real Chrome
 * `tabs.onActivated` event.
 */
export async function openSidepanel(
  context: BrowserContext,
  extensionId: string,
  initialTabIdOrOptions?: number | OpenSidepanelOptions
): Promise<Page> {
  const options: OpenSidepanelOptions =
    typeof initialTabIdOrOptions === 'number'
      ? { initialTabId: initialTabIdOrOptions }
      : (initialTabIdOrOptions ?? {});

  const params = new URLSearchParams();
  if (options.initialTabId !== undefined) {
    params.set('initialTabId', String(options.initialTabId));
  }
  if (options.skipPermissions) {
    params.set('skipPermissions', 'true');
  }
  const query = params.toString();

  const page = await context.newPage();
  const url = `chrome-extension://${extensionId}/sidepanel.html${query ? `?${query}` : ''}`;
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#root');
  return page;
}

export async function requestExplicitSidePanelOpen(
  context: BrowserContext,
  extensionId: string,
  tabId: number
): Promise<void> {
  const controlPage = await context.newPage();
  await controlPage.goto(`chrome-extension://${extensionId}/options.html`);
  await controlPage.evaluate(async (targetTabId) => {
    await chrome.runtime.sendMessage({
      type: 'open_side_panel',
      tabId: targetTabId
    });
  }, tabId);
  await controlPage.close();
}

export async function getActiveTabId(serviceWorker: Worker): Promise<number> {
  return await serviceWorker.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [tab] = await (globalThis as any).chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    });
    if (!tab?.id) throw new Error('No active tab');
    return tab.id as number;
  });
}

/** Resolve the chrome.tabs id of a Playwright page via the service worker. */
export async function getChromeTabIdFor(serviceWorker: Worker, page: Page): Promise<number> {
  const url = page.url();
  const id = await serviceWorker.evaluate(
    async ({ pageUrl }: { pageUrl: string }) => {
      const tabs = await (globalThis as any).chrome.tabs.query({});
      const match = tabs.find((tab: { url?: string }) => tab.url === pageUrl);
      return match?.id ?? null;
    },
    { pageUrl: url }
  );
  if (id == null) {
    throw new Error(`Could not find a chrome.tabs entry for Playwright page ${url}`);
  }
  return id;
}

export async function activateChromeTab(serviceWorker: Worker, tabId: number): Promise<void> {
  await serviceWorker.evaluate(async (id) => {
    await (globalThis as any).chrome.tabs.update(id, { active: true });
  }, tabId);
}

export async function sendMessage(page: Page, text: string): Promise<void> {
  const editor = page.locator('.ProseMirror');
  await editor.waitFor({ state: 'visible', timeout: 10_000 });
  await editor.click();
  await editor.fill(text);
  await page.waitForFunction(
    (expected) => document.querySelector('.ProseMirror')?.textContent?.includes(String(expected)),
    text,
    { timeout: 5_000 }
  );
  const sendBtn = page.locator('[data-test-id="send-button"]');
  await sendBtn.waitFor({ state: 'visible', timeout: 5000 });
  await sendBtn.click();
}

export async function waitForReplyDone(page: Page, timeout = 60_000): Promise<void> {
  const stopBtn = page.locator('[data-test-id="stop-button"]');
  const sendBtn = page.locator('[data-test-id="send-button"]');

  try {
    await stopBtn.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    // Stop button never appeared — response may have been too fast.
    // Fall through to wait for send button as the idle signal.
  }

  await sendBtn.waitFor({ state: 'visible', timeout });
}

export async function waitForAssistantMessage(page: Page, timeout = 60_000): Promise<string> {
  await page.waitForSelector('.superduck-response', { timeout });
  await waitForReplyDone(page, timeout);
  const messages = page.locator('.superduck-response');
  const last = messages.last();
  return (await last.textContent()) || '';
}

export async function getMessageCount(page: Page): Promise<number> {
  return page.locator('.superduck-response').count();
}

export async function clickStopButton(page: Page): Promise<void> {
  const stopBtn = page.locator('[data-test-id="stop-button"]');
  await stopBtn.click();
}
