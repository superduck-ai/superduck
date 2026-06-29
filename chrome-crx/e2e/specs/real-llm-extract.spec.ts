import { test, expect } from '../fixtures/extension';
import { runRealAgentTest, REAL_LLM_ENABLED } from '../helpers/realAgent';

// 复杂提取：从列表、表格、结构化内容里取数据，模拟真人查信息。

test.describe('real LLM · complex extraction', () => {
  test.skip(!REAL_LLM_ENABLED, 'SUPERDUCK_REAL_LLM_API_KEY not set');

  test('Hacker News front page → top 3 story titles', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://news.ycombinator.com', task: '读取 Hacker News 首页，告诉我前 3 条故事的标题。', label: 'extract-hn-top3', timeoutMs: 200_000 },
      ({ result }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(result.combinedText.trim().length).toBeGreaterThan(20);
      }
    );
  });

  test('Hacker News → points of first story', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://news.ycombinator.com', task: '告诉我 Hacker News 首页第一条故事的分数（points）。', label: 'extract-hn-points', timeoutMs: 200_000 },
      ({ result }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(result.combinedText).toMatch(/\d/);
      }
    );
  });

  test('example.com → page title + heading', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(180_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://example.com', task: '告诉我这个页面的标题（title）和大标题（h1）。', label: 'extract-example', timeoutMs: 160_000 },
      ({ result }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(result.combinedText.toLowerCase()).toContain('example');
      }
    );
  });

  test('Wikipedia EN → infobox value (Ada Lovelace, small task)', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(240_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://en.wikipedia.org/wiki/Ada_Lovelace', task: '只读取页面右上角的信息框（infobox），告诉我她"Born"那一行的内容。不要读取整页。', label: 'extract-wiki-infobox', timeoutMs: 220_000 },
      ({ result }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(result.combinedText).toMatch(/1815|December/i);
      }
    );
  });

  test('GitHub repo page → star count', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://github.com/microsoft/vscode', task: '告诉我这个仓库的 Star 数量（大约数字即可）。', label: 'extract-github-stars', timeoutMs: 200_000 },
      ({ result, finalUrl }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(finalUrl.toLowerCase()).toContain('github.com');
      }
    );
  });

  test('arxiv paper → title + authors', async ({ context, extensionId, serviceWorker }) => {
    test.setTimeout(220_000);
    await runRealAgentTest(
      { context, extensionId, serviceWorker, url: 'https://arxiv.org/abs/1706.03762', task: '告诉我这篇论文的标题和第一作者。', label: 'extract-arxiv', timeoutMs: 200_000 },
      ({ result }) => {
        expect(result.done, 'agent did not finish').toBe(true);
        expect(result.combinedText).toMatch(/attention/i);
      }
    );
  });
});
