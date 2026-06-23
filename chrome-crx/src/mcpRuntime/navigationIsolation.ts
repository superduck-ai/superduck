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

export interface NavigationPolicyContext {
  permissionManager: {
    checkPermission(
      url: string,
      toolUseId?: string
    ): Promise<{ allowed: boolean; needsPrompt?: boolean }>;
  };
  toolUseId?: string;
  toolName: string;
}

const ORG_BLOCKED_CATEGORY = 'category_org_blocked';
const BLOCKED_DOMAIN_CATEGORIES = new Set(['category1', 'category2', ORG_BLOCKED_CATEGORY]);

export async function checkDomainCategoryForNavigation(
  url: string,
  toolName: string
): Promise<ToolResult | null> {
  try {
    const category = await domainCategoryCache.getCategory(url);
    if (category && BLOCKED_DOMAIN_CATEGORIES.has(category)) {
      return {
        error:
          ORG_BLOCKED_CATEGORY === category
            ? "This site is blocked by your organization's policy."
            : 'This site is not allowed due to safety restrictions.'
      };
    }
  } catch (err) {
    // Intentionally fail-open here: the category lookup is a secondary safety
    // layer and matches navigate/tabs_create behavior. The primary gate is the
    // permission check, which still runs for every navigation, so a transient
    // category-cache error cannot by itself open an unapproved destination.
    console.warn(`[${toolName}] domain category check failed for`, url, err);
  }
  return null;
}

/**
 * Whether a URL derived from page activity may be opened/adopted into the
 * managed group, applying the same domain-category + permission gates as
 * navigate/tabs_create. needsPrompt is treated as not-yet-allowed: derived /
 * incidental navigations do not raise their own permission prompt (the agent
 * can navigate explicitly to trigger one), they are simply not adopted.
 */
async function isNavigationAllowedByPolicy(
  url: string,
  policy: NavigationPolicyContext
): Promise<boolean> {
  if (await checkDomainCategoryForNavigation(url, policy.toolName)) return false;
  const permission = await policy.permissionManager.checkPermission(url, policy.toolUseId);
  return permission.allowed === true;
}

/**
 * Opens a grouped child tab for a URL that was derived from page activity
 * (window.open events, search-result navigations) only after it passes the
 * navigation policy. Returns the new tab id, or null when the policy disallows
 * it so the caller simply skips opening the tab instead of bypassing the policy.
 */
export async function createPolicyCheckedChildTab(
  openerTabId: number,
  url: string,
  policy: NavigationPolicyContext
): Promise<number | null> {
  if (!(await isNavigationAllowedByPolicy(url, policy))) return null;
  const tabId = await tabGroupManager.createChildTabInGroup(openerTabId, url);
  return typeof tabId === 'number' ? tabId : null;
}

/**
 * Filters tabs that Chrome itself opened (window.open / target=_blank) and that
 * were adopted into the managed group, keeping only those whose URL passes the
 * navigation policy. Tabs that fail the policy are closed (not just hidden), so
 * a blocked/unapproved page cannot remain open in the browser; blank/system
 * tabs are kept (nothing to gate yet).
 */
export async function filterPolicyAllowedTabs(
  tabIds: number[],
  policy: NavigationPolicyContext
): Promise<number[]> {
  const allowed: number[] = [];
  for (const tabId of tabIds) {
    let url: string | undefined;
    try {
      url = (await chrome.tabs.get(tabId)).url;
    } catch {
      continue;
    }
    if (!url || url === 'about:blank' || !/^https?:\/\//.test(url)) {
      allowed.push(tabId);
      continue;
    }
    if (await isNavigationAllowedByPolicy(url, policy)) {
      allowed.push(tabId);
    } else {
      // The page opened this tab to a destination that fails the same gate as
      // navigate/tabs_create; close it so the policy actually prevents access
      // instead of leaving the blocked page open and merely unreported.
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        // Tab may already be gone; nothing else to do.
      }
    }
  }
  return allowed;
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
  policy: NavigationPolicyContext;
}): Promise<number[]> {
  const { openerTabId, previousUrl, timeoutMs = 1200, policy } = options;
  const nextUrl = await waitForChangedUrl(openerTabId, previousUrl, timeoutMs);
  if (!nextUrl || !isSearchLikeNavigation(previousUrl, nextUrl)) return [];

  try {
    const childTabId = await createPolicyCheckedChildTab(openerTabId, nextUrl, policy);
    return childTabId === null ? [] : [childTabId];
  } finally {
    // The opener already navigated in-page to the search results. Whether we
    // isolated them into a child tab (allowed), the destination failed the
    // navigation policy (blocked/unapproved), or the policy check threw, the
    // managed opener must not be left on that URL — always restore it.
    try {
      await chrome.tabs.update(openerTabId, { url: previousUrl });
    } catch {
      // If the opener disappeared, keeping any result tab is still useful.
    }
  }
}
