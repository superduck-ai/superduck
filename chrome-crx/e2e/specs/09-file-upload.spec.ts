import type { Page, Worker } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../fixtures/extension';
import { getDefaultProviderConfig, seedStorage } from '../fixtures/storage';
import { openSidepanel, sendMessage, waitForReplyDone } from '../helpers/sidepanel';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures-html');
const TEST_FILE_DIR = '/tmp/sd-e2e-file-upload';
const TEST_FILE_PATH = path.join(TEST_FILE_DIR, 'report.txt');

type MockContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

function buildSseMessage(content: MockContentBlock[], stopReason: 'end_turn' | 'tool_use'): string {
  const events: string[] = [
    `event: message_start\ndata: ${JSON.stringify({
      type: 'message_start',
      message: {
        id: `msg_mock_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-6',
        content: [],
        usage: { input_tokens: 100, output_tokens: 0 }
      }
    })}\n\n`
  ];
  content.forEach((block, index) => {
    if (block.type === 'text') {
      events.push(
        `event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } })}\n\n`,
        `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } })}\n\n`
      );
    } else {
      events.push(
        `event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } })}\n\n`,
        `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } })}\n\n`
      );
    }
    events.push(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index })}\n\n`);
  });
  events.push(
    `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: stopReason }, usage: { output_tokens: 50 } })}\n\n`,
    `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`
  );
  return events.join('');
}

async function startFixtureServer(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    const fixtureName =
      requestUrl.pathname === '/' ? 'file-upload.html' : decodeURIComponent(requestUrl.pathname.slice(1));
    if (!/^[a-zA-Z0-9_.-]+\.html$/.test(fixtureName)) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    try {
      const html = await readFile(path.join(FIXTURES_DIR, fixtureName));
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

async function stopFixtureServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function mockFileUploadLLM(page: Page, toolUse: MockContentBlock): Promise<void> {
  await page.evaluate(
    ({ toolUseData, sseFactoryText }) => {
      const buildSse = new Function(`return (${sseFactoryText})`)() as (
        content: unknown[],
        stopReason: string
      ) => string;
      const win = window as any;
      win.__originalFetch = win.__originalFetch || window.fetch;
      let toolUseSent = false;
      window.fetch = async (url: any, init?: any) => {
        const urlStr = typeof url === 'string' ? url : url?.url || url?.href || String(url);
        const isLLMCall =
          urlStr.includes('/v1/messages') ||
          urlStr.includes('/chat/completions') ||
          urlStr.includes('/v1/responses');
        if (!isLLMCall) return win.__originalFetch(url, init);
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        (win.__capturedToolResults = win.__capturedToolResults || []).push(
          ...(body.messages?.slice(-1)[0]?.content || [])
            .filter((b: any) => b.type === 'tool_result')
            .map((b: any) => (typeof b.content === 'string' ? b.content : JSON.stringify(b.content)))
        );
        const hasFileUpload =
          Array.isArray(body.tools) &&
          body.tools.some((tool: { name?: unknown }) => tool.name === 'file_upload');
        const shouldReturnToolUse = hasFileUpload && !toolUseSent;
        if (shouldReturnToolUse) toolUseSent = true;
        const response = shouldReturnToolUse
          ? { content: [toolUseData], stopReason: 'tool_use' }
          : { content: [{ type: 'text', text: 'Done' }], stopReason: 'end_turn' };
        return new Response(buildSse(response.content, response.stopReason), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }
        });
      };
    },
    { toolUseData: toolUse, sseFactoryText: buildSseMessage.toString() }
  );
}

async function getCapturedToolResults(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as any).__capturedToolResults || []);
}

async function getActiveTabId(serviceWorker: Worker): Promise<number> {
  return serviceWorker.evaluate(async () => {
    const tabs = await (globalThis as any).chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (typeof tabId !== 'number') throw new Error('No active tab id');
    return tabId;
  });
}

async function registerRef(
  serviceWorker: Worker,
  tabId: number,
  elementId: string,
  refName = 'ref_1'
): Promise<void> {
  await serviceWorker.evaluate(
    async ({ id, elementId, refName }) => {
      await (globalThis as any).chrome.scripting.executeScript({
        target: { tabId: id },
        func: (elId: string, ref: string) => {
          const el = document.getElementById(elId);
          if (!el) throw new Error(`Element #${elId} not found`);
          (window as any).__superduckElementMap = { ...(window as any).__superduckElementMap, [ref]: new WeakRef(el) };
          (window as any).__superduckRefCounter = Math.max((window as any).__superduckRefCounter || 0, 1);
        },
        args: [elementId, refName]
      });
    },
    { id: tabId, elementId, refName }
  );
}

async function getButtonCenter(targetPage: Page, selector: string): Promise<[number, number]> {
  const box = await targetPage.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) throw new Error(`Button ${sel} not found`);
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }, selector);
  return [box.x, box.y];
}

async function getFileState(targetPage: Page): Promise<{
  explicit: string | null;
  single: string | null;
  label: string | null;
  wrap: string | null;
  nested: string | null;
  hidden: string | null;
  explicitCount: number;
  singleCount: number;
  labelCount: number;
  wrapCount: number;
  nestedCount: number;
  hiddenCount: number;
}> {
  return targetPage.evaluate(() => (window as any).__getFileNames());
}

async function prepareSidepanel(
  targetPage: Page,
  serviceWorker: Worker,
  extensionId: string
): Promise<{ sidepanel: Page; tabId: number }> {
  await seedStorage(serviceWorker, { ...getDefaultProviderConfig() });
  await targetPage.bringToFront();
  const tabId = await getActiveTabId(serviceWorker);
  const sidepanel = await openSidepanel(targetPage.context(), extensionId, tabId);
  await expect(sidepanel.locator('#root')).toBeVisible();
  await sidepanel.waitForTimeout(1500);
  return { sidepanel, tabId };
}

test.describe('file_upload tool', () => {
  test.setTimeout(120_000);

  let fixtureServer: Server;
  let fixtureBaseUrl: string;

  test.beforeAll(async () => {
    const started = await startFixtureServer();
    fixtureServer = started.server;
    fixtureBaseUrl = started.baseUrl;
    await mkdir(TEST_FILE_DIR, { recursive: true });
    await writeFile(TEST_FILE_PATH, 'superduck e2e upload payload\n', 'utf8');
  });

  test.afterAll(async () => {
    await stopFixtureServer(fixtureServer);
  });

  function fixtureUrl(name: string): string {
    return `${fixtureBaseUrl}/${name}`;
  }

  test('uploads a local file via ref to an explicit <input type=file>', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    const targetPage = await context.newPage();
    await targetPage.goto(fixtureUrl('file-upload.html'));
    const { sidepanel, tabId } = await prepareSidepanel(targetPage, serviceWorker, extensionId);
    await registerRef(serviceWorker, tabId, 'explicit-input', 'ref_1');

    await mockFileUploadLLM(sidepanel, {
      type: 'tool_use',
      id: 'tool_file_upload_ref',
      name: 'file_upload',
      input: { paths: [TEST_FILE_PATH], ref: 'ref_1' }
    });

    await sendMessage(sidepanel, 'Upload the local report to the file input');
    await waitForReplyDone(sidepanel, 60_000);

    const state = await getFileState(targetPage);
    expect(state.explicitCount).toBe(1);
    expect(state.explicit).toBe('report.txt');

    await sidepanel.close();
    await targetPage.close();
  });

  test('uploads multiple local files via ref', async ({ context, extensionId, serviceWorker }) => {
    const secondFile = path.join(TEST_FILE_DIR, 'notes.txt');
    await writeFile(secondFile, 'second file\n', 'utf8');

    const targetPage = await context.newPage();
    await targetPage.goto(fixtureUrl('file-upload.html'));
    const { sidepanel, tabId } = await prepareSidepanel(targetPage, serviceWorker, extensionId);
    await registerRef(serviceWorker, tabId, 'explicit-input', 'ref_1');

    await mockFileUploadLLM(sidepanel, {
      type: 'tool_use',
      id: 'tool_file_upload_multi',
      name: 'file_upload',
      input: { paths: [TEST_FILE_PATH, secondFile], ref: 'ref_1' }
    });

    await sendMessage(sidepanel, 'Upload both local files');
    await waitForReplyDone(sidepanel, 60_000);

    const names = await targetPage.evaluate(() => {
      const input = document.getElementById('explicit-input') as HTMLInputElement;
      const out: string[] = [];
      if (input.files) for (const f of input.files) out.push(f.name);
      return out;
    });
    expect(names).toEqual(expect.arrayContaining(['report.txt', 'notes.txt']));
    expect(names.length).toBe(2);

    await sidepanel.close();
    await targetPage.close();
  });

  test('surfaces an error when the ref points at a non-file element', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    const targetPage = await context.newPage();
    await targetPage.goto(fixtureUrl('file-upload.html'));
    const { sidepanel, tabId } = await prepareSidepanel(targetPage, serviceWorker, extensionId);
    await registerRef(serviceWorker, tabId, 'picker-status', 'ref_1');

    await mockFileUploadLLM(sidepanel, {
      type: 'tool_use',
      id: 'tool_file_upload_bad_ref',
      name: 'file_upload',
      input: { paths: [TEST_FILE_PATH], ref: 'ref_1' }
    });

    await sendMessage(sidepanel, 'Upload to the broken ref');
    await waitForReplyDone(sidepanel, 60_000);

    const state = await getFileState(targetPage);
    expect(state.explicitCount).toBe(0);
    const toolResults = await getCapturedToolResults(sidepanel);
    expect(toolResults.join(' ')).toMatch(/No file input found|not a file input|Failed/i);

    await sidepanel.close();
    await targetPage.close();
  });

  test('uploads a local file via label ref retarget', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    const targetPage = await context.newPage();
    await targetPage.goto(fixtureUrl('file-upload.html'));
    const { sidepanel, tabId } = await prepareSidepanel(targetPage, serviceWorker, extensionId);
    await registerRef(serviceWorker, tabId, 'file-label', 'ref_1');

    await mockFileUploadLLM(sidepanel, {
      type: 'tool_use',
      id: 'tool_file_upload_label',
      name: 'file_upload',
      input: { paths: [TEST_FILE_PATH], ref: 'ref_1' }
    });

    await sendMessage(sidepanel, 'Upload via the label ref');
    await waitForReplyDone(sidepanel, 60_000);

    const state = await getFileState(targetPage);
    expect(state.labelCount).toBe(1);
    expect(state.label).toBe('report.txt');

    await sidepanel.close();
    await targetPage.close();
  });

  test('uploads a local file via button ref with nested input', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    const targetPage = await context.newPage();
    await targetPage.goto(fixtureUrl('file-upload.html'));
    const { sidepanel, tabId } = await prepareSidepanel(targetPage, serviceWorker, extensionId);
    await registerRef(serviceWorker, tabId, 'nested-upload-btn', 'ref_1');

    await mockFileUploadLLM(sidepanel, {
      type: 'tool_use',
      id: 'tool_file_upload_nested',
      name: 'file_upload',
      input: { paths: [TEST_FILE_PATH], ref: 'ref_1' }
    });

    await sendMessage(sidepanel, 'Upload via nested button ref');
    await waitForReplyDone(sidepanel, 60_000);

    const state = await getFileState(targetPage);
    expect(state.nestedCount).toBe(1);
    expect(state.nested).toBe('report.txt');

    await sidepanel.close();
    await targetPage.close();
  });

  test('uploads a local file via wrapping label ref retarget', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    const targetPage = await context.newPage();
    await targetPage.goto(fixtureUrl('file-upload.html'));
    const { sidepanel, tabId } = await prepareSidepanel(targetPage, serviceWorker, extensionId);
    await registerRef(serviceWorker, tabId, 'wrap-label', 'ref_1');

    await mockFileUploadLLM(sidepanel, {
      type: 'tool_use',
      id: 'tool_file_upload_wrap_label',
      name: 'file_upload',
      input: { paths: [TEST_FILE_PATH], ref: 'ref_1' }
    });

    await sendMessage(sidepanel, 'Upload via wrapping label ref');
    await waitForReplyDone(sidepanel, 60_000);

    const state = await getFileState(targetPage);
    expect(state.wrapCount).toBe(1);
    expect(state.wrap).toBe('report.txt');

    await sidepanel.close();
    await targetPage.close();
  });

  test('surfaces an error for relative paths', async ({ context, extensionId, serviceWorker }) => {
    const targetPage = await context.newPage();
    await targetPage.goto(fixtureUrl('file-upload.html'));
    const { sidepanel, tabId } = await prepareSidepanel(targetPage, serviceWorker, extensionId);
    await registerRef(serviceWorker, tabId, 'explicit-input', 'ref_1');

    await mockFileUploadLLM(sidepanel, {
      type: 'tool_use',
      id: 'tool_file_upload_relative',
      name: 'file_upload',
      input: { paths: ['report.txt'], ref: 'ref_1' }
    });

    await sendMessage(sidepanel, 'Upload with a relative path');
    await waitForReplyDone(sidepanel, 60_000);

    const state = await getFileState(targetPage);
    expect(state.explicitCount).toBe(0);
    const toolResults = await getCapturedToolResults(sidepanel);
    expect(toolResults.join(' ')).toMatch(/absolute/i);

    await sidepanel.close();
    await targetPage.close();
  });

  test('surfaces an error when multiple paths target a single-file input', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    const secondFile = path.join(TEST_FILE_DIR, 'extra.txt');
    await writeFile(secondFile, 'extra\n', 'utf8');

    const targetPage = await context.newPage();
    await targetPage.goto(fixtureUrl('file-upload.html'));
    const { sidepanel, tabId } = await prepareSidepanel(targetPage, serviceWorker, extensionId);
    await registerRef(serviceWorker, tabId, 'single-input', 'ref_1');

    await mockFileUploadLLM(sidepanel, {
      type: 'tool_use',
      id: 'tool_file_upload_single_multi',
      name: 'file_upload',
      input: { paths: [TEST_FILE_PATH, secondFile], ref: 'ref_1' }
    });

    await sendMessage(sidepanel, 'Upload two files to single-input');
    await waitForReplyDone(sidepanel, 60_000);

    const state = await getFileState(targetPage);
    expect(state.singleCount).toBe(0);
    const toolResults = await getCapturedToolResults(sidepanel);
    expect(toolResults.join(' ')).toMatch(/does not accept multiple files/i);

    await sidepanel.close();
    await targetPage.close();
  });

  test('uploads a local file via coordinate (intercepts native picker)', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    const targetPage = await context.newPage();
    await targetPage.goto(fixtureUrl('file-upload.html'));
    const { sidepanel } = await prepareSidepanel(targetPage, serviceWorker, extensionId);
    const [cx, cy] = await getButtonCenter(targetPage, '#picker-trigger');

    await mockFileUploadLLM(sidepanel, {
      type: 'tool_use',
      id: 'tool_file_upload_coord',
      name: 'file_upload',
      input: { paths: [TEST_FILE_PATH], coordinate: [cx, cy] }
    });

    await sendMessage(sidepanel, 'Click the upload button and pick the local file');
    await waitForReplyDone(sidepanel, 60_000);

    const state = await getFileState(targetPage);
    expect(state.hiddenCount).toBe(1);
    expect(state.hidden).toBe('report.txt');

    await sidepanel.close();
    await targetPage.close();
  });

});
