import type { ToolContext, ToolDefinition, ToolResult } from '../pageToolsSupport/types';
import { cdpDebugger } from '../cdp';
import { tabLeaseManager } from '../tabState/tabLeases';
import type { BatchAction } from './types';
import {
  DEBUGGER_REQUIRED_TOOLS,
  MUTATING_COMPUTER_ACTIONS,
  CHILD_ACTION_TIMEOUT_MS
} from './constants';

export function enhanceChildFailureMessage(toolName: string, error: string): string {
  if (/No element found with reference/i.test(error)) {
    return `${error} The ref is stale or was not registered on the current page. Run read_page/find again to get fresh refs. For fragile search boxes, use computer left_click with the fresh ref, then computer type/key.`;
  }
  if (toolName === 'form_input' && /Failed to execute form input/i.test(error)) {
    return `${error}. Run read_page/find again to refresh the ref, or focus the field with computer left_click(ref) and use computer type/key.`;
  }
  return error;
}

export function shouldWaitAfter(
  toolName: string,
  action: BatchAction,
  input: Record<string, unknown>
): boolean {
  if (action.waitAfter === 'none') return false;
  if (action.waitAfter === 'load') return true;
  if (toolName === 'navigate') return true;
  if (toolName !== 'computer') return false;
  const computerAction = typeof input.action === 'string' ? input.action : '';
  return MUTATING_COMPUTER_ACTIONS.has(computerAction);
}

export function shouldSettleAfter(
  toolName: string,
  action: BatchAction,
  nextAction:
    | {
        toolName: string;
        input: Record<string, unknown>;
      }
    | undefined
): boolean {
  if (action.waitAfter === 'none') return false;
  if (toolName !== 'form_input' || !nextAction || nextAction.toolName !== 'computer') return false;
  const nextComputerAction =
    typeof nextAction.input.action === 'string' ? nextAction.input.action : '';
  return nextComputerAction === 'key' || nextComputerAction === 'type';
}

export function isSystemUrl(url: string | undefined): boolean {
  return (
    !url ||
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('brave://') ||
    url.startsWith('about:') ||
    url.startsWith('data:') ||
    url.startsWith('javascript:')
  );
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

export async function ensureDebuggerAttachedForBatchStep(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<void> {
  if (!DEBUGGER_REQUIRED_TOOLS.has(toolName)) return;
  const targetTabId = typeof input.tabId === 'number' ? input.tabId : context.tabId;
  if (typeof targetTabId !== 'number') return;
  const browserSessionId = context.browserSessionScope?.sessionId;
  if (browserSessionId) {
    await tabLeaseManager.assertTabAvailableForSession(browserSessionId, targetTabId);
  }
  const tab = await chrome.tabs.get(targetTabId);
  if (isSystemUrl(tab.url)) return;
  const attachTimeoutMs = 10000;
  try {
    let wasAttached = false;
    try {
      wasAttached = await withTimeout(
        cdpDebugger.isDebuggerAttached(targetTabId),
        attachTimeoutMs,
        'Timed out checking debugger attachment'
      );
    } catch {
      wasAttached = false;
    }
    await withTimeout(
      cdpDebugger.attachDebugger(targetTabId),
      attachTimeoutMs,
      'Timed out attaching debugger'
    );
    if (!wasAttached) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch (err) {
    throw err;
  }
}

export async function runChildActionWithTimeout(
  tool: ToolDefinition,
  input: Record<string, unknown>,
  context: ToolContext,
  toolName: string
): Promise<ToolResult> {
  return await withTimeout(
    tool.execute(input, context),
    CHILD_ACTION_TIMEOUT_MS,
    `${toolName} timed out after ${CHILD_ACTION_TIMEOUT_MS}ms`
  );
}
