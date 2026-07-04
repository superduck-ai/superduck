import {
  hasActiveToolContext,
  getActiveToolContext,
  cleanupAfterToolExecution
} from './toolExecution/toolContextState';
import {
  getTabRelationship,
  getCategoryAndUpdateBlocklist,
  getBlockedPageUrl
} from './domainPermissions';

let waitUntilNavigationGuardBooted: (() => Promise<void>) | undefined;

export function setNavigationGuardBootWaiter(waiter: (() => Promise<void>) | undefined): void {
  waitUntilNavigationGuardBooted = waiter;
}

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;

  await waitUntilNavigationGuardBooted?.();

  if (!hasActiveToolContext(details.tabId)) return;

  const context = getActiveToolContext(details.tabId);
  if (!context) return;

  const { isMainTab, isSecondaryTab } = await getTabRelationship(details.tabId, details.tabId);
  if (!isMainTab && !isSecondaryTab) return;

  try {
    const category = await getCategoryAndUpdateBlocklist(details.tabId, details.url);
    if ('category1' === category) {
      const blockedUrl = getBlockedPageUrl(details.url);
      await chrome.tabs.update(details.tabId, { url: blockedUrl });
      if (context?.errorCallback) {
        context.errorCallback(
          'Cannot access this page. SuperDuck cannot assist with the content on this page.'
        );
      }
      cleanupAfterToolExecution(details.tabId);
      return;
    }
    await chrome.tabs.get(details.tabId);
    return undefined;
  } catch {
    // silently fail
  }
});
