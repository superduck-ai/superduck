import { test, expect } from '../fixtures/extension';
import { runRealAgentTest, REAL_LLM_ENABLED } from '../helpers/realAgent';

// 导航类：多步点击、跨页跳转、返回，模拟真人浏览。

test.describe('real LLM · navigation', () => {
  test.skip(!REAL_LLM_ENABLED, 'SUPERDUCK_REAL_LLM_API_KEY not set');

  test('Wikipedia → click internal link → verify new article', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://en.wikipedia.org/wiki/Computer_science', task: '点击词条正文里第一个指向另一个 Wikipedia 词条的链接，告诉我你跳转到了哪个词条。', label: 'nav-wiki-click', timeoutMs: 200_000 },
      ({ result, finalUrl }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(finalUrl).toContain('wikipedia.org/wiki/');
      }
    );
  });

  test('Navigate to a different URL → verify URL change', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://example.com', task: '导航到 https://www.iana.org/help/example-domains ，告诉我这个页面的标题。', label: 'nav-iana', timeoutMs: 200_000 },
      ({ result, finalUrl }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(finalUrl.toLowerCase()).toContain('iana.org');
      }
    );
  });

  test('Wikipedia portal → pick English → reach an article', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://www.wikipedia.org', task: '点击 English 链接进入英文 Wikipedia 首页，告诉我今日精选条目的标题。', label: 'nav-wiki-portal', timeoutMs: 200_000 },
      ({ result, finalUrl }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(finalUrl).toContain('wikipedia.org');
      }
    );
  });

  test('MDN → navigate to CSS reference → verify page', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://developer.mozilla.org/en-US/', task: '导航到 CSS 参考（CSS Reference）页面，告诉我该页面的主标题。', label: 'nav-mdn-css', timeoutMs: 200_000 },
      ({ result, finalUrl }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(finalUrl.toLowerCase()).toContain('developer.mozilla.org');
      }
    );
  });

  test('GitHub → navigate to trending → verify', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://github.com', task: '导航到 GitHub Trending 页面，告诉我列表里第一个仓库的名字。', label: 'nav-github-trending', timeoutMs: 200_000 },
      ({ result, finalUrl }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(finalUrl.toLowerCase()).toContain('github.com');
      }
    );
  });
});
