import { test as base, chromium, type BrowserContext, type Worker } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_PATH = path.resolve(__dirname, "../../dist");

export interface ExtensionFixtures {
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
}

export const test = base.extend<ExtensionFixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({ headless }, use) => {
    const context = await chromium.launchPersistentContext("", {
      // Keep `headless: false` so Playwright uses the full chromium binary
      // (not `chrome-headless-shell`, which silently disables --load-extension
      // and never starts the service worker). When `use.headless` is true we
      // opt back into the real headless mode via --headless=new below.
      headless: false,
      args: [
        ...(headless ? ["--headless=new", "--disable-gpu"] : []),
        `--disable-extensions-except=${DIST_PATH}`,
        `--load-extension=${DIST_PATH}`,
        "--silent-debugger-extension-api",
        "--no-first-run",
        "--disable-default-apps",
        "--disable-search-engine-choice-screen",
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent("serviceworker");
    }
    const id = sw.url().split("/")[2];
    await use(id);
  },

  serviceWorker: async ({ context }, use) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent("serviceworker");
    }
    await use(sw);
  },
});

export { expect } from "@playwright/test";
