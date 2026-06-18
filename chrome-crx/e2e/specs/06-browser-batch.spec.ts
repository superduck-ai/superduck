import type { Page, Worker } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../fixtures/extension';
import { getDefaultProviderConfig, seedStorage } from '../fixtures/storage';
import { openSidepanel, sendMessage, waitForReplyDone } from '../helpers/sidepanel';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures-html');

type MockContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

function buildSseMessage(content: MockContentBlock[], stopReason: 'end_turn' | 'tool_use'): string {
  const events: string[] = [];
  events.push(
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
  );

  content.forEach((block, index) => {
    if (block.type === 'text') {
      events.push(
        `event: content_block_start\ndata: ${JSON.stringify({
          type: 'content_block_start',
          index,
          content_block: { type: 'text', text: '' }
        })}\n\n`
      );
      events.push(
        `event: content_block_delta\ndata: ${JSON.stringify({
          type: 'content_block_delta',
          index,
          delta: { type: 'text_delta', text: block.text }
        })}\n\n`
      );
    } else {
      events.push(
        `event: content_block_start\ndata: ${JSON.stringify({
          type: 'content_block_start',
          index,
          content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} }
        })}\n\n`
      );
      events.push(
        `event: content_block_delta\ndata: ${JSON.stringify({
          type: 'content_block_delta',
          index,
          delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) }
        })}\n\n`
      );
    }
    events.push(
      `event: content_block_stop\ndata: ${JSON.stringify({
        type: 'content_block_stop',
        index
      })}\n\n`
    );
  });

  events.push(
    `event: message_delta\ndata: ${JSON.stringify({
      type: 'message_delta',
      delta: { stop_reason: stopReason },
      usage: { output_tokens: 50 }
    })}\n\n`
  );
  events.push(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
  return events.join('');
}

async function startFixtureServer(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    const fixtureName =
      requestUrl.pathname === '/'
        ? 'simple-form.html'
        : decodeURIComponent(requestUrl.pathname.slice(1));

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

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function stopFixtureServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function mockBatchLLM(
  page: Page,
  toolUse: Extract<MockContentBlock, { type: 'tool_use' }>
): Promise<void> {
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
        const hasTools =
          Array.isArray(body.tools) &&
          body.tools.some((tool: { name?: unknown }) => tool.name === 'browser_batch');
        const systemText =
          typeof body.system === 'string' ? body.system : JSON.stringify(body.system || '');
        const isMainAgentRequest = systemText.includes('You are SuperDuck running');
        const shouldReturnToolUse = (hasTools || isMainAgentRequest) && !toolUseSent;
        if (shouldReturnToolUse) toolUseSent = true;
        const response = shouldReturnToolUse
          ? { content: [toolUseData], stopReason: 'tool_use' }
          : { content: [{ type: 'text', text: '完成' }], stopReason: 'end_turn' };

        return new Response(buildSse(response.content, response.stopReason), {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive'
          }
        });
      };
    },
    { toolUseData: toolUse, sseFactoryText: buildSseMessage.toString() }
  );
}

async function getActiveTabId(serviceWorker: Worker): Promise<number> {
  return serviceWorker.evaluate(async () => {
    const tabs = await (globalThis as any).chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    const tabId = tabs[0]?.id;
    if (typeof tabId !== 'number') {
      throw new Error('No active tab id');
    }
    return tabId;
  });
}

async function getTabUrl(serviceWorker: Worker, tabId: number): Promise<string> {
  return serviceWorker.evaluate(async (id) => {
    const tab = await (globalThis as any).chrome.tabs.get(id);
    return tab.url || '';
  }, tabId);
}

async function registerSearchInputRef(serviceWorker: Worker, tabId: number): Promise<void> {
  await serviceWorker.evaluate(async (id) => {
    await (globalThis as any).chrome.scripting.executeScript({
      target: { tabId: id },
      func: () => {
        const input = document.getElementById('nav-search-keyword');
        if (!input) throw new Error('Search input not found');
        (window as any).__superduckElementMap = {
          ref_1: new WeakRef(input)
        };
        (window as any).__superduckRefCounter = 1;
      }
    });
  }, tabId);
}

async function prepareSidepanel(
  targetPage: Page,
  serviceWorker: Worker,
  extensionId: string,
  sidepanelLocale = 'zh-CN'
): Promise<{ sidepanel: Page; tabId: number }> {
  await seedStorage(serviceWorker, {
    ...getDefaultProviderConfig(),
    preferred_locale: sidepanelLocale
  });
  await targetPage.bringToFront();
  const tabId = await getActiveTabId(serviceWorker);
  const sidepanel = await openSidepanel(targetPage.context(), extensionId, tabId);
  await expect(sidepanel.locator('#root')).toBeVisible();
  return { sidepanel, tabId };
}

test.describe('browser_batch sidepanel execution', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90_000);

  let fixtureServer: Server;
  let fixtureBaseUrl: string;

  test.beforeAll(async () => {
    const started = await startFixtureServer();
    fixtureServer = started.server;
    fixtureBaseUrl = started.baseUrl;
  });

  test.afterAll(async () => {
    await stopFixtureServer(fixtureServer);
  });

  function fixtureUrl(name: string): string {
    return `${fixtureBaseUrl}/${name}`;
  }

  test('blocks navigate-first browser_batch from a system page', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    const targetPage = await context.newPage();
    await targetPage.goto('chrome://newtab/');
    const { sidepanel, tabId } = await prepareSidepanel(targetPage, serviceWorker, extensionId);

    await mockBatchLLM(sidepanel, {
      type: 'tool_use',
      id: 'tool_batch_system_nav',
      name: 'browser_batch',
      input: {
        actions: [
          { tool: 'navigate', input: { url: fixtureUrl('simple-form.html') } },
          { tool: 'read_page', input: { filter: 'interactive', max_chars: 2000 } }
        ]
      }
    });

    await sendMessage(sidepanel, '从系统页打开测试表单并读取页面');
    await waitForReplyDone(sidepanel, 60_000);

    expect(await getTabUrl(serviceWorker, tabId)).not.toContain(fixtureBaseUrl);
    await expect(sidepanel.getByText('完成')).toBeVisible();
    await expect(sidepanel.getByText('浏览器操作序列失败')).toBeVisible();
    await expect(sidepanel.locator('body')).not.toContainText('Browser batch failed');

    await sidepanel.close();
    await targetPage.close();
  });

  test('rejects navigate-find browser_batch before navigating from a system page', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    const targetPage = await context.newPage();
    await targetPage.goto('chrome://version/');
    const { sidepanel, tabId } = await prepareSidepanel(targetPage, serviceWorker, extensionId);

    await mockBatchLLM(sidepanel, {
      type: 'tool_use',
      id: 'tool_batch_unsafe_find',
      name: 'browser_batch',
      input: {
        actions: [
          { tool: 'navigate', input: { url: fixtureUrl('simple-form.html') } },
          { tool: 'find', input: { query: 'Name' } }
        ]
      }
    });

    await sendMessage(sidepanel, '打开表单并查找名称输入框');
    await waitForReplyDone(sidepanel, 60_000);

    expect(await getTabUrl(serviceWorker, tabId)).toMatch(/^chrome:\/\//);
    await expect(sidepanel.getByText('浏览器操作序列失败')).toBeVisible();
    await expect(sidepanel.locator('body')).not.toContainText('Browser batch failed');

    await sidepanel.close();
    await targetPage.close();
  });

  test('rejects same-batch read_page output consumption before filling fields', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    const targetPage = await context.newPage();
    await targetPage.goto(fixtureUrl('simple-form.html'));
    const { sidepanel } = await prepareSidepanel(targetPage, serviceWorker, extensionId);

    await mockBatchLLM(sidepanel, {
      type: 'tool_use',
      id: 'tool_batch_unsafe_form',
      name: 'browser_batch',
      input: {
        actions: [
          { tool: 'read_page', input: { filter: 'interactive', max_chars: 2000 } },
          { tool: 'form_input', input: { ref: 'ref_1', value: 'Ada Lovelace' } }
        ]
      }
    });

    await sendMessage(sidepanel, '读取页面并填写姓名');
    await waitForReplyDone(sidepanel, 60_000);

    await expect(targetPage.locator('#name')).toHaveValue('');
    await expect(sidepanel.getByText('操作序列在第 1/2 步停止')).toBeVisible();
    await expect(sidepanel.locator('body')).not.toContainText('Browser batch failed');

    await sidepanel.close();
    await targetPage.close();
  });

  test('uses browser_batch with a fresh search ref on a local search page', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    const targetPage = await context.newPage();
    await targetPage.goto(fixtureUrl('bilibili-search.html'));
    const { sidepanel, tabId } = await prepareSidepanel(targetPage, serviceWorker, extensionId);
    await registerSearchInputRef(serviceWorker, tabId);

    await mockBatchLLM(sidepanel, {
      type: 'tool_use',
      id: 'tool_batch_search_input',
      name: 'browser_batch',
      input: {
        actions: [
          { tool: 'form_input', input: { ref: 'ref_1', value: 'DeepSeek' } },
          { tool: 'computer', input: { action: 'key', text: 'Enter' } }
        ]
      }
    });

    await sendMessage(sidepanel, '用 fresh ref 批量输入 DeepSeek');
    await expect(targetPage.locator('#nav-search-keyword')).toHaveValue('DeepSeek', {
      timeout: 45_000
    });
    await waitForReplyDone(sidepanel, 60_000);

    await expect(targetPage.locator('[data-testid="search-results"]')).toContainText(
      'DeepSeek 最新视频'
    );
    await expect.poll(() => targetPage.url(), { timeout: 10_000 }).toContain('keyword=DeepSeek');
    const events = await targetPage.evaluate(() => (window as any).__searchEvents);
    expect(events).toContainEqual(expect.objectContaining({ type: 'input', value: 'DeepSeek' }));
    await expect(sidepanel.getByText('完成')).toBeVisible();
    await expect(sidepanel.locator('body')).not.toContainText(
      /Browser batch failed|批量浏览器操作失败|浏览器操作序列失败/
    );

    await sidepanel.close();
    await targetPage.close();
  });
});
