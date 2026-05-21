import type { Page } from "@playwright/test";

export async function waitForToolCall(page: Page, toolName?: string, timeout = 15_000): Promise<void> {
  if (toolName) {
    await page.waitForFunction(
      (name) => {
        const els = document.querySelectorAll(".group\\/row, [class*='tool']");
        return Array.from(els).some((el) => el.textContent?.toLowerCase().includes(name.toLowerCase()));
      },
      toolName,
      { timeout }
    );
  } else {
    await page.waitForSelector(".group\\/row, [class*='ToolUse'], [class*='tool-use']", { timeout });
  }
}

export async function getToolCallCount(page: Page): Promise<number> {
  return page.locator("button.group\\/row").count();
}

export async function expandToolCall(page: Page, index = 0): Promise<void> {
  const buttons = page.locator("button.group\\/row");
  const btn = buttons.nth(index);
  await btn.click();
}
