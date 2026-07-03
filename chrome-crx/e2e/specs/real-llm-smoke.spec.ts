import { test, expect } from '../fixtures/extension';
import { seedStorage } from '../fixtures/storage';
import { getRealProviderConfig, REAL_LLM_ENABLED, REAL_LLM_MODEL_ID } from '../fixtures/realLLM';
import { getActiveTabId, openSidepanel, sendMessage, waitForAssistantMessage } from '../helpers/sidepanel';

// Drives the PRODUCTION agent loop against a real LLM (qwen3.7-plus via
// token.cvte.com, anthropic protocol). Skipped unless
// SUPERDUCK_REAL_LLM_API_KEY is set, so CI never hits the network.

test.describe('real LLM smoke', () => {
  test.skip(!REAL_LLM_ENABLED, 'SUPERDUCK_REAL_LLM_API_KEY not set');

  test.setTimeout(120_000);

  test('pure-text reply arrives from the real model', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    await seedStorage(serviceWorker, getRealProviderConfig());

    const targetPage = await context.newPage();
    await targetPage.goto('https://example.com');
    await targetPage.bringToFront();

    const tabId = await getActiveTabId(serviceWorker);
    const sidepanel = await openSidepanel(context, extensionId, tabId);
    await expect(sidepanel.locator('#root')).toBeVisible();

    const errors: string[] = [];
    sidepanel.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await sendMessage(sidepanel, `请用一句话介绍你自己，并在末尾附上模型名 ${REAL_LLM_MODEL_ID}。`);
    const reply = await waitForAssistantMessage(sidepanel, 90_000);

    expect(reply.trim().length).toBeGreaterThan(0);
    // The sidepanel must not have surfaced an error toast / error bubble.
    await expect(sidepanel.locator('body')).not.toContainText(/error|失败|错误/i, { timeout: 2_000 });

    await sidepanel.close();
    await targetPage.close();
  });
});
