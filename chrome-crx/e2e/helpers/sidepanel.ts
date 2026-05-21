import type { BrowserContext, Page } from "@playwright/test";

export async function openSidepanel(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("#root");
  return page;
}

export async function sendMessage(page: Page, text: string): Promise<void> {
  const editor = page.locator(".ProseMirror");
  await editor.waitFor({ state: "visible", timeout: 10_000 });
  await editor.click();
  await editor.fill(text);
  await page.waitForFunction(
    (expected) => document.querySelector(".ProseMirror")?.textContent?.includes(String(expected)),
    text,
    { timeout: 5_000 }
  );
  const sendBtn = page.locator('[data-test-id="send-button"]');
  await sendBtn.waitFor({ state: "visible", timeout: 5000 });
  await sendBtn.click();
}

export async function waitForReplyDone(page: Page, timeout = 60_000): Promise<void> {
  const stopBtn = page.locator('[data-test-id="stop-button"]');
  const sendBtn = page.locator('[data-test-id="send-button"]');

  try {
    await stopBtn.waitFor({ state: "visible", timeout: 5_000 });
  } catch {
    // Stop button never appeared — response may have been too fast.
    // Fall through to wait for send button as the idle signal.
  }

  await sendBtn.waitFor({ state: "visible", timeout });
}

export async function waitForAssistantMessage(page: Page, timeout = 60_000): Promise<string> {
  await page.waitForSelector(".superduck-response", { timeout });
  await waitForReplyDone(page, timeout);
  const messages = page.locator(".superduck-response");
  const last = messages.last();
  return (await last.textContent()) || "";
}

export async function getMessageCount(page: Page): Promise<number> {
  return page.locator(".superduck-response").count();
}

export async function clickStopButton(page: Page): Promise<void> {
  const stopBtn = page.locator('[data-test-id="stop-button"]');
  await stopBtn.click();
}
