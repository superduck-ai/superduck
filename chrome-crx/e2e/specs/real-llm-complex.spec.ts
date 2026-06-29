import { test, expect } from '../fixtures/extension';
import { writeFileSync } from 'node:fs';
import { seedStorage } from '../fixtures/storage';
import { getRealProviderConfig, REAL_LLM_ENABLED } from '../fixtures/realLLM';
import { getActiveTabId, openSidepanel, sendMessage } from '../helpers/sidepanel';
import { runAgentTask, attachLlmObserver, dumpDebugBundle, type AgentRunResult } from '../helpers/realLLM';

// Real-LLM end-to-end: drives the production agent loop against qwen3.7-plus
// on real public websites with multi-step tool use. Skipped without
// SUPERDUCK_REAL_LLM_API_KEY. A polling watchdog captures LLM calls, console
// errors and per-poll DOM snapshots so a stall is diagnosable before the test
// timeout tears the context down.

test.describe('real LLM complex interaction', () => {
  test.skip(!REAL_LLM_ENABLED, 'SUPERDUCK_REAL_LLM_API_KEY not set');

  async function startDebug(serviceWorker: import('@playwright/test').Worker) {
    await serviceWorker.evaluate(async () => {
      const b = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      await b.startDebugSession({ extensionVersion: '0.1.0-real-llm' });
    });
  }

  test.afterEach(async ({ serviceWorker }) => {
    await serviceWorker.evaluate(() => {
      const b = (globalThis as { __superduckDebugBridge?: { resetDebugRecorder: () => void } })
        .__superduckDebugBridge;
      b?.resetDebugRecorder();
    });
  });

  function diagnose(result: AgentRunResult, label: string) {
    console.log(`[${label}] done=${result.done} llmCalls=${result.llmCalls.length} errs=${result.consoleErrors.length}`);
    result.llmCalls.forEach((c, i) => {
      console.log(
        `[${label} #${i}] ${c.status} ${c.durationMs}ms model=${c.requestModel} ` +
          `roles=${JSON.stringify(c.messageRoles)} tools=${c.toolsCount} sysLen=${c.systemLen}`
      );
    });
    if (result.consoleErrors.length > 0) {
      console.log(`[${label}] console errors:\n${result.consoleErrors.slice(0, 20).join('\n')}`);
    }
    console.log(`[${label}] combined tail:\n${result.combinedText.slice(-800)}`);
    try {
      writeFileSync(`/tmp/sd_real_llm_${label}_llmcalls.json`, JSON.stringify(result.llmCalls, null, 2));
    } catch {
      // ignore
    }
  }

  test('navigate + read_page extracts Ada Lovelace birth/death years', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    test.setTimeout(280_000);
    await startDebug(serviceWorker);
    await seedStorage(serviceWorker, getRealProviderConfig());

    const targetPage = await context.newPage();
    await targetPage.goto('https://en.wikipedia.org/wiki/Ada_Lovelace');
    await targetPage.bringToFront();

    const tabId = await getActiveTabId(serviceWorker);
    const sidepanel = await openSidepanel(context, extensionId, tabId);
    await expect(sidepanel.locator('#root')).toBeVisible();
    const { llmCalls, consoleErrors } = await attachLlmObserver(sidepanel);

    sidepanel.on('pageerror', (err) => {
      console.log(`[ada PAGEERROR] ${err.message}`);
    });
    sidepanel.on('close', () => {
      console.log('[ada SIDEPANEL CLOSE] sidepanel page closed');
    });

    await sendMessage(
      sidepanel,
      `阅读当前页面，告诉我 Ada Lovelace 的出生年份和去世年份。只回答两个年份。`
    );

    const result = await runAgentTask(sidepanel, llmCalls, consoleErrors, {
      timeoutMs: 250_000,
      label: 'ada',
      onStall: async () => {
        await dumpDebugBundle(serviceWorker, 'ada_stall');
      }
    });
    diagnose(result, 'ada');

    if (!result.done) {
      await dumpDebugBundle(serviceWorker, 'ada');
    }

    expect(result.done, 'agent did not return to idle').toBe(true);
    expect(result.combinedText, `responses:\n${result.combinedText}`).toContain('1815');
    expect(result.combinedText, `responses:\n${result.combinedText}`).toContain('1852');

    await sidepanel.close();
    await targetPage.close();
  });
});
