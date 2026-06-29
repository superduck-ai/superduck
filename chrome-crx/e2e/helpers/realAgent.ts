import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect } from '@playwright/test';
import { seedStorage } from '../fixtures/storage';
import { getRealProviderConfig, REAL_LLM_ENABLED } from '../fixtures/realLLM';
import { getActiveTabId, openSidepanel, sendMessage } from './sidepanel';
import { attachLlmObserver, runAgentTask, dumpDebugBundle, type AgentRunResult, type LlmCallRecord } from './realLLM';

export interface RealAgentCtx {
  result: AgentRunResult;
  targetPage: Page;
  sidepanel: Page;
  serviceWorker: Worker;
  finalUrl: string;
  sdDebug: string[];
  llmCalls: LlmCallRecord[];
}

export interface RunRealAgentOptions {
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
  url: string;
  task: string;
  label: string;
  timeoutMs?: number;
  /** If true, start a debug session on the service worker (adds overhead). */
  withDebug?: boolean;
  /** Extra wait for page load after goto. */
  pageReadySelector?: string;
}

/**
 * High-level helper: seed real-LLM config, open target page + sidepanel, send
 * the task, drive the watchdog, capture diagnostics, then hand the result to
 * `assert` for verification. Cleans up on completion.
 */
export async function runRealAgentTest(
  opts: RunRealAgentOptions,
  assert: (ctx: RealAgentCtx) => Promise<void> | void
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  if (opts.withDebug) {
    await opts.serviceWorker.evaluate(async () => {
      const b = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      await b?.startDebugSession({ extensionVersion: '0.1.0-real-llm' });
    });
  }
  await seedStorage(opts.serviceWorker, getRealProviderConfig());

  const targetPage = await opts.context.newPage();
  await targetPage.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  if (opts.pageReadySelector) {
    await targetPage.waitForSelector(opts.pageReadySelector, { timeout: 20_000 }).catch(() => {});
  }
  await targetPage.bringToFront();

  const tabId = await getActiveTabId(opts.serviceWorker);
  const sidepanel = await openSidepanel(opts.context, opts.extensionId, tabId);
  await expect(sidepanel.locator('#root')).toBeVisible({ timeout: 15_000 });

  const { llmCalls, consoleErrors } = await attachLlmObserver(sidepanel);
  const sdDebug: string[] = [];
  sidepanel.on('console', (msg) => {
    const txt = msg.text();
    if (txt.includes('[SD_DEBUG]')) sdDebug.push(txt);
  });
  sidepanel.on('pageerror', (err) => {
    console.log(`[${opts.label} PAGEERROR] ${err.message}`);
  });
  sidepanel.on('close', () => {
    console.log(`[${opts.label} SIDEPANEL CLOSE] page closed`);
  });
  await sidepanel.evaluate(() => {
    (globalThis as { __SD_DEBUG_MSGS?: boolean }).__SD_DEBUG_MSGS = true;
  });

  await sendMessage(sidepanel, opts.task);

  const result = await runAgentTask(sidepanel, llmCalls, consoleErrors, {
    timeoutMs,
    label: opts.label,
    onStall: async () => {
      if (opts.withDebug) await dumpDebugBundle(opts.serviceWorker, `${opts.label}_stall`);
    }
  });

  console.log(
    `[${opts.label}] done=${result.done} llm=${result.llmCalls.length} errs=${result.consoleErrors.length} ` +
      `sdDebug=${sdDebug.length}`
  );

  let finalUrl = '';
  try {
    finalUrl = await opts.serviceWorker.evaluate(async (id) => {
      const tab = await (globalThis as any).chrome.tabs.get(id);
      return tab?.url || '';
    }, tabId);
  } catch {
    // tab gone
  }
  console.log(`[${opts.label}] finalUrl=${finalUrl}`);

  const ctx: RealAgentCtx = { result, targetPage, sidepanel, serviceWorker: opts.serviceWorker, finalUrl, sdDebug, llmCalls: result.llmCalls };

  try {
    await assert(ctx);
  } catch (err) {
    // On assertion failure, dump diagnostics while context is still alive.
    if (opts.withDebug) await dumpDebugBundle(opts.serviceWorker, opts.label);
    console.log(`[${opts.label}] sdDebug tail:\n${sdDebug.slice(-15).join('\n')}`);
    throw err;
  }

  await sidepanel.close().catch(() => {});
  await targetPage.close().catch(() => {});
  if (opts.withDebug) {
    await opts.serviceWorker.evaluate(() => {
      const b = (globalThis as { __superduckDebugBridge?: { resetDebugRecorder: () => void } }).__superduckDebugBridge;
      b?.resetDebugRecorder();
    });
  }
}

export { REAL_LLM_ENABLED };
