import { test, expect } from '../fixtures/extension';
import { runRealAgentTest, REAL_LLM_ENABLED } from '../helpers/realAgent';

// 边缘场景：404、空搜索、大页面、SPA、非英文，模拟真人遇到的异常/极端情况。

test.describe('real LLM · edge cases', () => {
  test.skip(!REAL_LLM_ENABLED, 'SUPERDUCK_REAL_LLM_API_KEY not set');

  test('404 page → describe what happened', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(200_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://en.wikipedia.org/wiki/ThisPageDoesNotExistXYZ123', task: '告诉我当前页面发生了什么（是否找不到页面）。', label: 'edge-404', timeoutMs: 180_000 },
      ({ result }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(result.combinedText.trim().length).toBeGreaterThan(0);
      }
    );
  });

  test('Search gibberish → no results', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://www.bing.com', task: '搜索 "zzxxqqxxyywweerrttyy12345" 这个无意义词，告诉我是否没有搜索结果。', label: 'edge-empty-search', timeoutMs: 200_000 },
      ({ result, finalUrl }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(finalUrl.toLowerCase()).toContain('bing.com');
      }
    );
  });

  test('Large Wikipedia article → extract fact (read_page stress)', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(280_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://en.wikipedia.org/wiki/United_States', task: '告诉我美国于哪一年独立（独立宣言年份）。', label: 'edge-large-page', timeoutMs: 260_000, withDebug: true },
      ({ result }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(result.combinedText).toContain('1776');
      }
    );
  });

  test('SPA client-side routing → React docs', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://react.dev', task: '告诉我这个网站的页头导航里有哪些主要菜单项。', label: 'edge-spa-react', timeoutMs: 200_000 },
      ({ result }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(result.combinedText.trim().length).toBeGreaterThan(0);
      }
    );
  });

  test('Non-English page (Japanese Wikipedia) → extract', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://ja.wikipedia.org/wiki/東京', task: 'このページの最初の段落を中国語で要約して。', label: 'edge-ja-tokyo', timeoutMs: 200_000 },
      ({ result }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(result.combinedText.trim().length).toBeGreaterThan(0);
      }
    );
  });

  test('Page with cookie/consent banner → dismiss + read', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://www.cnn.com', task: '如果有 cookie 同意弹窗就先关闭它，然后告诉我页面顶部的大标题。', label: 'edge-cookie-cnn', timeoutMs: 200_000 },
      ({ result }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(result.combinedText.trim().length).toBeGreaterThan(0);
      }
    );
  });
});
