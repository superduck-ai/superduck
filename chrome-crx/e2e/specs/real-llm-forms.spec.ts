import { test, expect } from '../fixtures/extension';
import { runRealAgentTest, REAL_LLM_ENABLED } from '../helpers/realAgent';

// 表单交互：在真实站点的搜索框里输入 + 提交，模拟真人填表单。

test.describe('real LLM · form interaction', () => {
  test.skip(!REAL_LLM_ENABLED, 'SUPERDUCK_REAL_LLM_API_KEY not set');

  test('Wikipedia search box → type query + submit', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://en.wikipedia.org', task: '在页面右上角的搜索框里输入 "Python (programming language)" 然后回车，打开搜索结果。', label: 'form-wiki-python', timeoutMs: 200_000 },
      ({ result, finalUrl }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(finalUrl).toMatch(/wiki\/Python|search/i);
      }
    );
  });

  test('Bing search box → type + Enter', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://www.bing.com', task: '在搜索框里输入 "TypeScript tutorial" 然后回车。', label: 'form-bing-ts', timeoutMs: 200_000 },
      ({ result, finalUrl }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(finalUrl.toLowerCase()).toContain('bing.com');
      }
    );
  });

  test('DuckDuckGo search box → type + submit', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://duckduckgo.com', task: '在搜索框里输入 "Rust async runtime" 然后回车提交搜索。', label: 'form-ddg-rust', timeoutMs: 200_000 },
      ({ result, finalUrl }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(finalUrl.toLowerCase()).toContain('duckduckgo.com');
      }
    );
  });

  test('Hacker News search box → type + submit', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://news.ycombinator.com', task: '点击页面上方的搜索链接，在搜索框输入 "Show HN" 然后提交。', label: 'form-hn-shown', timeoutMs: 200_000 },
      ({ result, finalUrl }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(finalUrl).toContain('ycombinator.com');
      }
    );
  });

  test('GitHub search → type repo name + submit', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://github.com', task: '在 GitHub 顶部的搜索框里输入 "microsoft/vscode" 然后回车，打开该仓库页面。', label: 'form-github-vscode', timeoutMs: 200_000 },
      ({ result, finalUrl }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(finalUrl.toLowerCase()).toContain('github.com');
      }
    );
  });

  test('Wikipedia ZH search box → Chinese input + submit', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://zh.wikipedia.org', task: '在搜索框里输入"长江"然后回车，打开长江词条。', label: 'form-wiki-zh-yangtze', timeoutMs: 200_000 },
      ({ result, finalUrl }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(finalUrl).toMatch(/wiki\/|search/i);
      }
    );
  });
});
