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

async function resolveActiveTab(explicit?: number): Promise<chrome.tabs.Tab> {
  if (explicit !== undefined && explicit !== null) {
    return await chrome.tabs.get(explicit);
  }
  const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
  const tabs = await chrome.tabs.query({ active: true, windowId: win.id });
  if (!tabs.length || tabs[0].id === undefined) {
    throw new Error('No active tab in last focused window');
  }
  return tabs[0];
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
  eTLDPlus1
};
