import { test, expect } from '../fixtures/extension';
import { runRealAgentTest, REAL_LLM_ENABLED } from '../helpers/realAgent';

// 搜索场景：在真实搜索引擎 / 百科上执行搜索 + 提取，模拟真人查找信息。

test.describe('real LLM · search scenarios', () => {
  test.skip(!REAL_LLM_ENABLED, 'SUPERDUCK_REAL_LLM_API_KEY not set');

  test('Wikipedia EN search for Alan Turing → death year', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://en.wikipedia.org', task: '搜索 "Alan Turing"，打开他的词条，告诉我他去世的年份。', label: 'wiki-search-turing', timeoutMs: 200_000 },
      ({ result }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(result.combinedText).toContain('1954');
      }
    );
  });

  test('Wikipedia EN search for Einstein → birth year', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://en.wikipedia.org', task: '搜索 "Albert Einstein"，打开词条，告诉我他的出生年份。', label: 'wiki-search-einstein', timeoutMs: 200_000 },
      ({ result }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(result.combinedText).toContain('1879');
      }
    );
  });

  test('Bing search for a fact → extract from results', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://www.bing.com', task: '搜索 "Eiffel Tower height meters"，告诉我埃菲尔铁塔的高度（米）。', label: 'bing-search-eiffel', timeoutMs: 200_000 },
      ({ result, finalUrl }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(finalUrl.toLowerCase()).toContain('bing.com');
      }
    );
  });

  test('Hacker News search → find a story title', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://news.ycombinator.com', task: '在 Hacker News 上搜索 "Rust"，告诉我搜到的第一条故事标题。', label: 'hn-search-rust', timeoutMs: 200_000 },
      ({ result, finalUrl }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(finalUrl).toContain('ycombinator.com');
      }
    );
  });

  test('Wikipedia ZH search for 北京 → confirm it is capital', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://zh.wikipedia.org', task: '搜索"北京"，打开词条，确认它是中国首都，回答"是"或"否"。', label: 'wiki-zh-beijing', timeoutMs: 200_000 },
      ({ result }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(result.combinedText).toMatch(/是/);
      }
    );
  });

  test('MDN search for a CSS property → doc page', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://developer.mozilla.org', task: '在 MDN 搜索 "flex-direction"，打开文档页，告诉我它有几个可选值。', label: 'mdn-search-flex', timeoutMs: 200_000 },
      ({ result, finalUrl }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(finalUrl).toContain('developer.mozilla.org');
      }
    );
  });
});
