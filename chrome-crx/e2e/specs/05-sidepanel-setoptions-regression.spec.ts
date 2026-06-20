import { test, expect } from '../fixtures/extension';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { seedStorage } from '../fixtures/storage';
import { getActiveTabId, openSidepanel, requestExplicitSidePanelOpen } from '../helpers/sidepanel';

/**
 * Regression: chrome.sidePanel.setOptions must use a stable path.
 *
 * Root cause: openSidePanel (src/background/sidePanel.ts) used to call
 * setOptions with path `sidepanel.html?initialTabId=<n>`, embedding the
 * active tab id in the query string. Every time openSidePanel ran with
 * a different tab (or even the same tab on a second invocation), the
 * URL changed and Chrome reloaded the sidepanel iframe — killing any
 * running agent mid-conversation.
 *
 * Fix: setOptions now uses the stable path `sidepanel.html` (no query
 * string). useActiveTabId resolves the active tab dynamically via
 * chrome.tabs.query + chrome.tabs.onActivated, so the parameter was
 * never needed.
 *
 * See: https://github.com/superduck-ai/superduck/pull/240
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readServiceWorkerBundle(): string {
  const assetsDir = path.resolve(__dirname, '../../dist/assets');
  const entries = fs.readdirSync(assetsDir);
  const match = entries.find((name) => /^service-worker-loader\.js-[A-Za-z0-9_-]+\.js$/.test(name));
  if (!match) {
    throw new Error(
      `Could not find service-worker bundle in ${assetsDir}. ` +
        `Run 'bun run build' before e2e tests.`
    );
  }
  return fs.readFileSync(path.join(assetsDir, match), 'utf8');
}

test.describe('sidepanel setOptions stable path (PR #240)', () => {
  test('static guard: setOptions path has no initialTabId query parameter', () => {
    const bundle = readServiceWorkerBundle();

    // setOptions is called with path: "sidepanel.html" — no ?initialTabId
    // or any other query parameter. The compiled code must have the
    // closing quote right after sidepanel.html.
    expect(bundle).toMatch(/path:\s*"sidepanel\.html"/);

    // No query string in the setOptions path.
    expect(bundle).not.toMatch(/path:\s*"sidepanel\.html\?/);

    // initialTabId doesn't appear anywhere in the service worker bundle.
    expect(bundle).not.toMatch(/initialTabId/);
  });

  test('e2e: sidepanel loads without initialTabId and resolves active tab', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    await seedStorage(serviceWorker, {
      // Minimal config so the app doesn't crash on missing provider.
      aiProviderConfigVersion: 2,
      browserControlPermissionAccepted: true
    });

    // Open a real tab so the sidepanel has an active tab to bind to.
    const targetPage = await context.newPage();
    await targetPage.goto('https://example.com');
    await targetPage.bringToFront();

    const targetTabId = await getActiveTabId(serviceWorker);
    await requestExplicitSidePanelOpen(context, extensionId, targetTabId);

    // Open without initialTabId — mirrors how Chrome opens the real panel.
    const sidepanel = await openSidepanel(context, extensionId);

    // React tree mounted.
    await expect(sidepanel.locator('#root')).toBeVisible();

    // Explicit open_side_panel tracked the active tab. PANEL_READY must not
    // be the path that claims unmanaged tabs.
    await expect
      .poll(
        async () => {
          return serviceWorker.evaluate(async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stored = await (globalThis as any).chrome.storage.local.get('tabGroups');
            return stored.tabGroups ?? null;
          });
        },
        { timeout: 5000, intervals: [200, 500, 1000] }
      )
      .not.toBeNull();

    await sidepanel.close();
    await targetPage.close();
  });

  test('e2e: repeated open_side_panel messages do not reload sidepanel', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    await seedStorage(serviceWorker, {
      aiProviderConfigVersion: 2,
      browserControlPermissionAccepted: true
    });

    const targetPage = await context.newPage();
    await targetPage.goto('https://example.com');
    await targetPage.bringToFront();
    const targetTabId = await getActiveTabId(serviceWorker);

    const sidepanel = await openSidepanel(context, extensionId);
    await expect(sidepanel.locator('#root')).toBeVisible();

    // Stamp a marker in sessionStorage — survives re-renders but NOT a
    // full iframe reload.
    await sidepanel.evaluate(() => {
      sessionStorage.setItem('__reload_probe__', 'alive');
    });

    // Fire open_side_panel twice more through the service worker,
    // mimicking the user toggling the panel or a scheduled task.
    for (let i = 0; i < 2; i++) {
      await requestExplicitSidePanelOpen(context, extensionId, targetTabId);
      await new Promise((r) => setTimeout(r, 500));
    }

    // If Chrome had reloaded the iframe (because setOptions changed the
    // URL), sessionStorage would be wiped and the marker would be gone.
    const probe = await sidepanel.evaluate(() => sessionStorage.getItem('__reload_probe__'));
    expect(probe).toBe('alive');

    await sidepanel.close();
    await targetPage.close();
  });
});
