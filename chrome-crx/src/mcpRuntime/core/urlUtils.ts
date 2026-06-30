import type { ToolTabSummary } from '../pageToolsSupport/types';

export function extractAppName(url: string): string | undefined {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return parts[parts.length - 2];
    }
    return hostname;
  } catch {
    return undefined;
  }
}

export function formatTabsOutput(
  tabs: ToolTabSummary[] | null | undefined,
  tabGroupId?: number,
  activeTabId?: number
): string {
  if (!tabs || tabs.length === 0) return 'No tabs available.';
  const lines = tabs.map((tab) => {
    const tabId = typeof tab.id === 'number' ? tab.id : 'unknown';
    const title = typeof tab.title === 'string' ? tab.title : '';
    const url = typeof tab.url === 'string' ? tab.url : '';
    const active = activeTabId !== undefined && tab.id === activeTabId ? ' (active)' : '';
    return `- tabId ${tabId}: "${title}" (${url})${active}`;
  });
  return `Tab Group ${tabGroupId ?? 'unknown'}:\n${lines.join('\n')}`;
}

export function normalizeUrl(url: string): string {
  if (!url.match(/^https?:\/\//)) return `https://${url}`;
  return url;
}
