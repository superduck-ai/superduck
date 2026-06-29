import type { Page, Worker } from '@playwright/test';
import { writeFileSync } from 'node:fs';

export interface LlmCallRecord {
  url: string;
  status: number;
  durationMs: number;
  requestModel?: string;
  messageCount?: number;
  messageRoles?: string[];
  toolsCount?: number;
  systemLen?: number;
  error?: string;
}

export interface AgentSnapshot {
  t: number;
  sendBtnVisible: boolean;
  stopBtnVisible: boolean;
  toolCallCount: number;
  lastAssistantTail: string;
  llmCalls: LlmCallRecord[];
  consoleErrors: string[];
}

export interface AgentRunResult {
  done: boolean;
  snapshots: AgentSnapshot[];
  combinedText: string;
  llmCalls: LlmCallRecord[];
  consoleErrors: string[];
}

/**
 * Read-only LLM observer. Captures ONLY request bodies via page.on('request')
 * + status/timing via page.on('response'). NEVER wraps fetch or tees the
 * response stream — doing so breaks the Anthropic SDK's stream reader
 * ("Connection error.") and turns observation into a Heisenbug.
 */
export async function attachLlmObserver(page: Page): Promise<{ llmCalls: LlmCallRecord[]; consoleErrors: string[] }> {
  const llmCalls: LlmCallRecord[] = [];
  const consoleErrors: string[] = [];
  const inflight = new Map<string, { url: string; start: number; model?: string; roles?: string[]; tools?: number; sysLen?: number }>();

  page.on('request', (req) => {
    const url = req.url();
    if (!url.includes('/v1/messages') && !url.includes('/chat/completions') && !url.includes('/v1/responses')) return;
    let model: string | undefined;
    let roles: string[] | undefined;
    let tools: number | undefined;
    let sysLen: number | undefined;
    try {
      const body = req.postDataJSON() as { model?: string; messages?: Array<{ role?: string }>; tools?: unknown[]; system?: unknown } | null;
      model = body?.model;
      if (Array.isArray(body?.messages)) roles = body!.messages.map((m) => m.role || '?');
      tools = Array.isArray(body?.tools) ? body!.tools!.length : undefined;
      const sys = body?.system;
      sysLen = typeof sys === 'string' ? sys.length : Array.isArray(sys) ? JSON.stringify(sys).length : undefined;
    } catch {
      // ignore
    }
    const key = `${url}:${Date.now()}:${Math.random()}`;
    inflight.set(key, { url, start: Date.now(), model, roles, tools, sysLen });
  });

  page.on('response', (res) => {
    const url = res.url();
    if (!url.includes('/v1/messages') && !url.includes('/chat/completions') && !url.includes('/v1/responses')) return;
    // Match the oldest inflight entry for this url.
    let matchKey: string | undefined;
    for (const [k, v] of inflight) {
      if (v.url === url) { matchKey = k; break; }
    }
    const entry = matchKey ? inflight.get(matchKey) : undefined;
    if (matchKey) inflight.delete(matchKey);
    const rec: LlmCallRecord = {
      url,
      status: res.status(),
      durationMs: entry ? Date.now() - entry.start : 0,
      requestModel: entry?.model,
      messageCount: entry?.roles?.length,
      messageRoles: entry?.roles,
      toolsCount: entry?.tools,
      systemLen: entry?.sysLen
    };
    llmCalls.push(rec);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(`pageerror: ${err.message}`);
  });

  return { llmCalls, consoleErrors };
}

async function readState(page: Page): Promise<Omit<AgentSnapshot, 't' | 'llmCalls' | 'consoleErrors'>> {
  return page.evaluate(() => {
    const sendBtn = document.querySelector('[data-test-id="send-button"]');
    const stopBtn = document.querySelector('[data-test-id="stop-button"]');
    const responses = Array.from(document.querySelectorAll('.superduck-response'));
    const last = responses[responses.length - 1]?.textContent || '';
    const toolRows = document.querySelectorAll("button.group\\/row, [class*='ToolUse']");
    return {
      sendBtnVisible: !!sendBtn && sendBtn.getBoundingClientRect().width > 0,
      stopBtnVisible: !!stopBtn && stopBtn.getBoundingClientRect().width > 0,
      toolCallCount: toolRows.length,
      lastAssistantTail: last.slice(-400)
    };
  });
}

export async function runAgentTask(
  sidepanel: Page,
  llmCalls: LlmCallRecord[],
  consoleErrors: string[],
  opts: { timeoutMs: number; pollMs?: number; label: string; onStall?: () => Promise<void> }
): Promise<AgentRunResult> {
  const pollMs = opts.pollMs ?? 8000;
  const start = Date.now();
  const deadline = start + opts.timeoutMs;
  const snapshots: AgentSnapshot[] = [];
  let done = false;
  let lastLlmCount = 0;
  let lastProgressT = start;
  let stallFired = false;

  while (Date.now() < deadline) {
    await sidepanel.waitForTimeout(pollMs);
    const state = await readState(sidepanel).catch(() => ({
      sendBtnVisible: false,
      stopBtnVisible: false,
      toolCallCount: 0,
      lastAssistantTail: '<page gone>'
    }));
    const snap: AgentSnapshot = {
      t: Date.now(),
      ...state,
      llmCalls: [...llmCalls],
      consoleErrors: [...consoleErrors]
    };
    snapshots.push(snap);

    const prevTools = snapshots[snapshots.length - 2]?.toolCallCount ?? 0;
    const progressed = llmCalls.length !== lastLlmCount || state.toolCallCount !== prevTools;
    if (progressed) {
      lastProgressT = Date.now();
      lastLlmCount = llmCalls.length;
      stallFired = false;
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    const lastLlm = llmCalls[llmCalls.length - 1];
    console.log(
      `[${opts.label} +${elapsed}s] send=${state.sendBtnVisible} stop=${state.stopBtnVisible} ` +
        `tools=${state.toolCallCount} llm=${llmCalls.length} ` +
        `lastLLM=${lastLlm ? `${lastLlm.status} roles=${JSON.stringify(lastLlm.messageRoles)} sys=${lastLlm.systemLen}` : 'none'} ` +
        `tail=${JSON.stringify(state.lastAssistantTail.slice(-100))}`
    );

    if (state.sendBtnVisible && !state.stopBtnVisible && (snap.toolCallCount > 0 || state.lastAssistantTail)) {
      done = true;
      break;
    }

    if (!stallFired && Date.now() - lastProgressT > 45_000 && state.stopBtnVisible && !state.sendBtnVisible) {
      stallFired = true;
      console.log(`[${opts.label} +${elapsed}s] STALL detected — firing onStall`);
      if (opts.onStall) await opts.onStall();
    }
  }

  const combinedText = await sidepanel
    .evaluate(() =>
      Array.from(document.querySelectorAll('.superduck-response')).map((el) => el.textContent || '').join('\n')
    )
    .catch(() => '');

  return { done, snapshots, combinedText, llmCalls, consoleErrors };
}

export async function dumpDebugBundle(serviceWorker: Worker, label: string): Promise<void> {
  try {
    const bundle = await serviceWorker.evaluate(async () => {
      const b = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      return await b.exportDebugBundle();
    });
    const out = `/tmp/sd_real_llm_${label}_${Date.now()}.json`;
    writeFileSync(out, JSON.stringify(bundle, null, 2));
    console.log(`[debug bundle] ${label} → ${out}`);
    const findings = bundle?.diagnosis?.findings || [];
    console.log(`[debug findings] ${label}: ${findings.length > 0 ? JSON.stringify(findings, null, 2) : 'none'}`);
  } catch (err) {
    console.log(`[debug bundle] ${label} export failed: ${String(err)}`);
  }
}
