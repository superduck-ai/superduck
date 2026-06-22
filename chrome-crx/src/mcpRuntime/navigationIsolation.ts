import { waitForTabLoading } from './shared';
import { domainCategoryCache, tabGroupManager } from './tabState';
import type { ToolResult } from './pageToolsSupport/types';

const SEARCH_QUERY_PARAMS = new Set([
  'q',
  'query',
  'keyword',
  'keywords',
  'search',
  'search_query',
  'text',
  'wd',
  'word'
]);

export async function checkDomainCategoryForNavigation(
  url: string,
  toolName: string
): Promise<ToolResult | null> {
  try {
    const category = await domainCategoryCache.getCategory(url);
    if (
      category &&
      ('category1' === category || 'category2' === category || 'category_org_blocked' === category)
    ) {
      return {
        error:
          'category_org_blocked' === category
            ? "This site is blocked by your organization's policy."
            : 'This site is not allowed due to safety restrictions.'
      };
    }
  } catch (err) {
    console.warn(`[${toolName}] domain category check failed for`, url, err);
  }
  return null;
}

function parseHttpUrl(url: string): URL | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function hasSearchQueryParam(url: URL): boolean {
  for (const param of SEARCH_QUERY_PARAMS) {
    const value = url.searchParams.get(param);
    if (value?.trim()) return true;
  }
  return false;
}

export function isSearchLikeNavigation(previousUrl: string, nextUrl: string): boolean {
  if (previousUrl === nextUrl) return false;

  const previous = parseHttpUrl(previousUrl);
  const next = parseHttpUrl(nextUrl);
  if (!previous || !next) return false;

  const host = next.hostname.toLowerCase();
  if ((host.startsWith('search.') || host.includes('.search.')) && hasSearchQueryParam(next)) {
    return true;
  }

  const path = next.pathname.toLowerCase();
  if ((path.includes('/search') || path.endsWith('/search')) && hasSearchQueryParam(next)) {
    return true;
  }

  return previous.hostname !== next.hostname && host.startsWith('search.');
}

async function waitForChangedUrl(
  tabId: number,
  previousUrl: string,
  timeoutMs: number
): Promise<string | undefined> {
  const start = Date.now();
  let lastUrl: string | undefined;

  while (Date.now() - start < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      lastUrl = tab.url || lastUrl;
      if (tab.url && tab.url !== previousUrl) {
        await waitForTabLoading(tabId, 500);
        const settledTab = await chrome.tabs.get(tabId).catch(() => tab);
        return settledTab.url || tab.url;
      }
    } catch {
      return lastUrl;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return lastUrl && lastUrl !== previousUrl ? lastUrl : undefined;
}

export async function moveSearchNavigationToNewTab(options: {
  openerTabId: number;
  previousUrl: string;
  timeoutMs?: number;
}): Promise<number[]> {
  const { openerTabId, previousUrl, timeoutMs = 1200 } = options;
  const nextUrl = await waitForChangedUrl(openerTabId, previousUrl, timeoutMs);
  if (!nextUrl || !isSearchLikeNavigation(previousUrl, nextUrl)) return [];

  const childTabId = await tabGroupManager.createChildTabInGroup(openerTabId, nextUrl);
  if (typeof childTabId !== 'number') return [];

  try {
    await chrome.tabs.update(openerTabId, { url: previousUrl });
  } catch {
    // If the opener disappeared, keeping the result tab is still useful.
  }

  return [childTabId];
}
