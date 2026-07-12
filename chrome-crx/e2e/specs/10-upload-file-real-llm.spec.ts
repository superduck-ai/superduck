/**
 * Real-LLM e2e for upload_file — validates the page-injected resolver path
 * (resolveUploadFileRefTarget serialized → rebuilt via Function) against a
 * live provider. Skipped unless E2E_REAL_LLM=1 + E2E_LLM_* are set.
 *
 * Unlike 09 (which mocks the LLM fetch), this sends a real request so the
 * full agent loop runs: SDK in sidepanel → tool execution in SW → CDP
 * DOM.setFileInputFiles. The ref is pre-registered and the prompt names it
 * explicitly to keep LLM output deterministic.
 */
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../fixtures/extension';
import { getDefaultProviderConfig, isRealLlmMode, seedStorage } from '../fixtures/storage';
import {
  activateChromeTab,
  getChromeTabIdFor,
  openSidepanel,
  sendMessage,
  waitForReplyDone
} from '../helpers/sidepanel';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures-html');
const TEST_FILE_DIR = path.join('/tmp', 'sd-e2e-file-upload-real');
const TEST_FILE_PATH = path.join(TEST_FILE_DIR, 'report.txt');

async function startFixtureServer(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const name = url.pathname === '/' ? 'file-upload.html' : decodeURIComponent(url.pathname.slice(1));
    try {
      const html = await readFile(path.join(FIXTURES_DIR, name));
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(html);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function registerRef(serviceWorker: Worker, tabId: number, elementId: string, refName: string) {
  await serviceWorker.evaluate(
    async ({ id, elementId, refName }) => {
      await (globalThis as any).chrome.scripting.executeScript({
        target: { tabId: id },
        func: (elId: string, ref: string) => {
          const el = document.getElementById(elId);
          if (!el) throw new Error(`Element #${elId} not found`);
          (window as any).__superduckElementMap = {
            ...(window as any).__superduckElementMap,
            [ref]: new WeakRef(el)
          };
        },
        args: [elementId, refName]
      });
    },
    { id: tabId, elementId, refName }
  );
}

test.describe('upload_file tool (real LLM)', () => {
  test.skip(!isRealLlmMode(), 'set E2E_REAL_LLM=1 + E2E_LLM_* to run');
  test.setTimeout(180_000);

  let fixtureServer: Server;
  let fixtureBaseUrl: string;

  test.beforeAll(async () => {
    const started = await startFixtureServer();
    fixtureServer = started.server;
    fixtureBaseUrl = started.baseUrl;
    await mkdir(TEST_FILE_DIR, { recursive: true });
    await writeFile(TEST_FILE_PATH, 'superduck e2e real-llm payload\n', 'utf8');
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
  });

  test('uploads a local file via ref using a real LLM provider', async ({
    context,
    extensionId,
    serviceWorker
  }: {
    context: BrowserContext;
    extensionId: string;
    serviceWorker: Worker;
  }) => {
    await seedStorage(serviceWorker, { ...getDefaultProviderConfig() });

    const targetPage = await context.newPage();
    try {
      await targetPage.goto(`${fixtureBaseUrl}/file-upload.html`);
      await targetPage.bringToFront();
      const tabId = await getChromeTabIdFor(serviceWorker, targetPage);
      await activateChromeTab(serviceWorker, tabId);

      const sidepanel = await openSidepanel(context, extensionId, {
        initialTabId: tabId,
        skipPermissions: true
      });
      try {
        await expect(sidepanel.locator('#root')).toBeVisible();
        await sidepanel.locator('.ProseMirror').waitFor({ state: 'visible', timeout: 10_000 });

        await registerRef(serviceWorker, tabId, 'explicit-input', 'ref_1');

        await sendMessage(
          sidepanel,
          `Use the upload_file tool to upload the local file at ${TEST_FILE_PATH} to the file input referenced by ref_1. Call the tool exactly once with ref="ref_1" and paths=["${TEST_FILE_PATH}"]. Do not read the page first.`
        );
        await waitForReplyDone(sidepanel, 150_000);

        const names = await targetPage.evaluate(() =>
          (window as any).__getFileNames?.().explicitNames ?? []
        );
        expect(names).toContain('report.txt');
      } finally {
        await sidepanel.close();
      }
    } finally {
      await targetPage.close();
    }
  });
});
