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
    const sw = await getServiceWorker(context);
    const id = sw.url().split("/")[2];
    await use(id);
  },

  serviceWorker: async ({ context }, use) => {
    const sw = await getServiceWorker(context);
    await use(sw);
  },
});

async function getServiceWorker(context: BrowserContext): Promise<Worker> {
  const sw = context.serviceWorkers()[0];
  if (sw) return sw;

  return new Promise<Worker>((resolve, reject) => {
    let resolved = false;
    const timer = setInterval(() => {
      const currentSw = context.serviceWorkers()[0];
      if (currentSw) {
        clearInterval(timer);
        if (!resolved) {
          resolved = true;
          resolve(currentSw);
        }
      }
    }, 100);

    context.waitForEvent("serviceworker")
      .then((eventSw) => {
        clearInterval(timer);
        if (!resolved) {
          resolved = true;
          resolve(eventSw);
        }
      })
      .catch((err) => {
        clearInterval(timer);
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });
  });
}

export { expect } from "@playwright/test";
