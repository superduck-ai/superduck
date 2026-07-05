import type { ToolContext } from '../pageTools';
import { tabLeaseManager, type TabLeaseOrigin } from '../tabState/tabLeases';
import type { ActiveContextScriptResult, ToolScriptResult } from './types';

const LIST_TABS_CHROME_API_TIMEOUT_MS = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function withChromeApiTimeout<T>(stage: string, promise: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () =>
        reject(new Error(`${stage} timed out after ${LIST_TABS_CHROME_API_TIMEOUT_MS / 1000}s`)),
      LIST_TABS_CHROME_API_TIMEOUT_MS
    );
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function isActiveContextScriptResult(value: unknown): value is ActiveContextScriptResult {
  return (
    isRecord(value) &&
    (value.url === undefined || typeof value.url === 'string') &&
    (value.title === undefined || typeof value.title === 'string') &&
    (value.selection === undefined || typeof value.selection === 'string') &&
    (value.text === undefined || typeof value.text === 'string')
  );
}

function isToolScriptResult(value: unknown): value is ToolScriptResult {
  return (
    isRecord(value) &&
    typeof value.ok === 'boolean' &&
    (value.reason === undefined || typeof value.reason === 'string') &&
    (value.tag === undefined || typeof value.tag === 'string') &&
    (value.text === undefined || typeof value.text === 'string') &&
    (value.value === undefined || typeof value.value === 'string') &&
    (value.key === undefined || typeof value.key === 'string')
  );
}

function getBrowserSessionId(context: ToolContext): string {
  return context.browserSessionScope.sessionId;
}

async function resolveActiveTab(
  explicit: number | undefined,
  context: ToolContext
): Promise<chrome.tabs.Tab> {
  if (typeof context.tabId !== 'number' && typeof explicit !== 'number') {
    const focusedWindow = await withChromeApiTimeout(
      'chrome.windows.getLastFocused',
      chrome.windows.getLastFocused({ populate: true })
    );
    const activeTab = focusedWindow.tabs?.find((tab) => tab.active);
    if (activeTab?.id === undefined) throw new Error('No active tab found in context');
    const resolvedTabId = await context.resolveTabId(activeTab.id);
    const resolvedTab = await chrome.tabs.get(resolvedTabId);
    if (resolvedTab.id === undefined) throw new Error('Tab has no id');
    return resolvedTab;
  }
  const effectiveTabId = await context.resolveTabId(explicit);
  const tab = await chrome.tabs.get(effectiveTabId);
  if (tab.id === undefined) throw new Error('Tab has no id');
  return tab;
}

async function claimTabForContext(
  tabId: number,
  context: ToolContext,
  options: { groupId?: number; origin?: TabLeaseOrigin } = {}
): Promise<void> {
  const sessionId = getBrowserSessionId(context);
  await tabLeaseManager.claimTab(sessionId, tabId, options.origin ?? 'agent', {
    groupId: options.groupId
  });
}

async function filterTabsForContext(
  tabs: chrome.tabs.Tab[],
  context: ToolContext
): Promise<chrome.tabs.Tab[]> {
  const sessionId = getBrowserSessionId(context);

  const visibleTabs: chrome.tabs.Tab[] = [];
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    const lease = await tabLeaseManager.getLease(tab.id);
    if (!lease || lease.sessionId === sessionId) visibleTabs.push(tab);
  }
  return visibleTabs;
}

function eTLDPlus1(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  const second = parts[parts.length - 2];
  const known2LD = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac']);
  if (known2LD.has(second) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

export {
  LIST_TABS_CHROME_API_TIMEOUT_MS,
  withChromeApiTimeout,
  isActiveContextScriptResult,
  isToolScriptResult,
  resolveActiveTab,
  claimTabForContext,
  filterTabsForContext,
  eTLDPlus1
};
