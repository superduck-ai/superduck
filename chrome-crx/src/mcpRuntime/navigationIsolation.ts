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

export const ORG_BLOCKED_CATEGORY = 'category_org_blocked';
export const BLOCKED_DOMAIN_CATEGORIES = new Set(['category1', 'category2', ORG_BLOCKED_CATEGORY]);

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
export async function isNavigationAllowedByPolicy(
  url: string,
  policy: NavigationPolicyContext
): Promise<boolean> {
  if (await checkDomainCategoryForNavigation(url, policy.toolName)) return false;
  const permission = await policy.permissionManager.checkPermission(url, policy.toolUseId);
  return permission.allowed === true;
}

export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export async function closeTabIfPresent(tabId: number): Promise<void> {
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    // Tab may already be gone.
  }
}

export async function enforceChildNavigationPolicy(
  tabId: number,
  url: string | undefined,
  policy: NavigationPolicyContext
): Promise<boolean> {
  if (!url || !isHttpUrl(url)) return true;
  if (await isNavigationAllowedByPolicy(url, policy)) return true;
  await closeTabIfPresent(tabId);
  return false;
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
  if (typeof tabId !== 'number') return null;
  const detachGuard = guardChildNavigation(tabId, policy);
  let currentUrl: string | undefined;
  try {
    currentUrl = (await chrome.tabs.get(tabId)).url;
  } catch {
    detachGuard();
    return null;
  }
  if (!(await enforceChildNavigationPolicy(tabId, currentUrl, policy))) {
    detachGuard();
    return null;
  }
  return tabId;
}

export const DEFERRED_NAV_GUARD_TIMEOUT_MS = 30000;

/**
 * Watches a child tab for a bounded window: if it later navigates to a URL that
 * fails the navigation policy, the tab is closed and the listener detaches.
 * `onAllowed` runs (best-effort) when a derived navigation passes the gate, so
 * callers that track per-tab blocklist state can update it. Returns a detach
 * handle so the caller can stop watching early.
 */
export function guardChildNavigation(
  tabId: number,
  policy: NavigationPolicyContext,
  options: {
    timeoutMs?: number;
    onAllowed?: (url: string) => Promise<void> | void;
  } = {}
): () => void {
  const onUpdated = chrome.tabs?.onUpdated;
  if (!onUpdated?.addListener) return () => undefined;

  let detached = false;
  const timeoutRef: { current?: ReturnType<typeof setTimeout> } = {};
  const detach = () => {
    if (detached) return;
    detached = true;
    if (timeoutRef.current !== undefined) clearTimeout(timeoutRef.current);
    try {
      onUpdated.removeListener(listener);
    } catch {
      // Listener may already be detached.
    }
  };
  const listener = (updatedTabId: number, changeInfo: { url?: string }) => {
    if (updatedTabId !== tabId) return;
    const url = changeInfo.url;
    if (!url || !isHttpUrl(url)) return;
    void (async () => {
      if (await isNavigationAllowedByPolicy(url, policy)) {
        try {
          await options.onAllowed?.(url);
        } catch {
          // Blocklist side-effect is best-effort; never let it affect the gate.
        }
      } else {
        detach();
        await closeTabIfPresent(tabId);
      }
    })();
  };

  onUpdated.addListener(listener);
  timeoutRef.current = setTimeout(detach, options.timeoutMs ?? DEFERRED_NAV_GUARD_TIMEOUT_MS);
  (timeoutRef.current as { unref?: () => void }).unref?.();
  return detach;
}

/**
 * Filters tabs that Chrome itself opened (window.open / target=_blank) and that
 * were adopted into the managed group, keeping only those whose URL passes the
 * navigation policy. Tabs that fail the policy are closed (not just hidden), so
 * a blocked/unapproved page cannot remain open in the browser. Kept child tabs
 * are watched for a bounded window so a later redirect or opener-driven
 * navigation to a disallowed destination closes them too.
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
    if (!url || url === 'about:blank') {
      guardChildNavigation(tabId, policy);
      allowed.push(tabId);
      continue;
    }
    if (!isHttpUrl(url)) {
      allowed.push(tabId);
      continue;
    }
    if (await isNavigationAllowedByPolicy(url, policy)) {
      guardChildNavigation(tabId, policy);
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

  // A search-result page must actually carry a search query; otherwise a plain
  // submit/link to a search.* host (e.g. a settings page) would be mis-isolated.
  if (!hasSearchQueryParam(next)) return false;

  const host = next.hostname.toLowerCase();
  if (host.startsWith('search.') || host.includes('.search.')) return true;

  const path = next.pathname.toLowerCase();
  return path.includes('/search') || path.endsWith('/search');
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
