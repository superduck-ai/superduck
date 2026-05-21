import type { BrowserContext, Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, "../fixtures-html");

export async function openFixturePage(context: BrowserContext, name: string): Promise<Page> {
  const page = await context.newPage();
  const filePath = path.join(FIXTURES_DIR, name);
  await page.goto(`file://${filePath}`);
  await page.waitForLoadState("domcontentloaded");
  return page;
}

export async function openOptionsPage(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.waitForLoadState("domcontentloaded");
  return page;
}
