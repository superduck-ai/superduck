import { test, expect } from '../fixtures/extension';
import { runRealAgentTest, REAL_LLM_ENABLED } from '../helpers/realAgent';

// 交互类：键盘快捷键、滚动、hover、跨站多步工作流，模拟真人复杂操作。

test.describe('real LLM · interaction & workflow', () => {
  test.skip(!REAL_LLM_ENABLED, 'SUPERDUCK_REAL_LLM_API_KEY not set');

  test('GitHub → press / to focus search', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://github.com', task: '按键盘 "/" 聚焦搜索框，输入 "go" 然后回车。告诉我跳转到的页面 URL。', label: 'int-github-slash', timeoutMs: 200_000 },
      ({ result, finalUrl }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(finalUrl.toLowerCase()).toContain('github.com');
      }
    );
  });

  test('Scroll down long page → find footer', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://news.ycombinator.com', task: '向下滚动到页面底部，告诉我页脚（footer）区域的文字。', label: 'int-scroll-hn', timeoutMs: 200_000 },
      ({ result }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(result.combinedText.trim().length).toBeGreaterThan(0);
      }
    );
  });

  test('Cross-site: Bing search → click Wikipedia → extract year', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(260_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://www.bing.com', task: '搜索 "Marie Curie Nobel Prize year"，点击指向 Wikipedia 的结果，告诉我她第一次获诺贝尔奖的年份。', label: 'int-cross-marie', timeoutMs: 240_000 },
      ({ result }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(result.combinedText).toContain('1903');
      }
    );
  });

  test('Wikipedia → scroll to section → extract heading', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(240_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://en.wikipedia.org/wiki/Python_(programming_language)', task: '滚动到 "History" 章节，告诉我该章节标题下的第一段话大意。', label: 'int-scroll-section', timeoutMs: 220_000 },
      ({ result }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(result.combinedText.trim().length).toBeGreaterThan(0);
      }
    );
  });

  test('GitHub repo → click "Issues" tab → verify', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://github.com/microsoft/vscode', task: '点击仓库的 "Issues" 标签页，告诉我当前有多少个 open issues（大致数字）。', label: 'int-github-issues', timeoutMs: 200_000 },
      ({ result, finalUrl }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(finalUrl.toLowerCase()).toMatch(/github\.com.*issues/);
      }
    );
  });

  test('Multi-step: HN → click comments → back → click another', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(260_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://news.ycombinator.com', task: '点击首页第二条故事的 "comments" 链接进入评论页，然后返回首页。告诉我你看到了什么。', label: 'int-hn-comments', timeoutMs: 240_000 },
      ({ result }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(result.combinedText.trim().length).toBeGreaterThan(0);
      }
    );
  });
});
