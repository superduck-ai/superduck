import type { TabGroupManager } from './tabGroups';

export async function isTabInSameGroup(
  mgr: TabGroupManager,
  tabId1: number,
  tabId2: number
): Promise<boolean> {
  try {
    await mgr.initialize();
    const mainTabId = await mgr.getMainTabId(tabId1);
    if (!mainTabId) return tabId1 === tabId2;
    return mainTabId === (await mgr.getMainTabId(tabId2));
  } catch (err) {
    return false;
  }
}

export async function getValidTabIds(mgr: TabGroupManager, tabId: number): Promise<number[]> {
  try {
    await mgr.initialize();
    const mainTabId = await mgr.getMainTabId(tabId);
    if (!mainTabId) return [tabId];
    return (await mgr.getGroupDetails(mainTabId)).memberTabs.map((m) => m.tabId);
  } catch (err) {
    return [tabId];
  }
}

export async function getValidTabsWithMetadata(
  mgr: TabGroupManager,
  tabId: number
): Promise<{ id: number; title: string; url: string }[]> {
  try {
    const tabIds = await getValidTabIds(mgr, tabId);
    return await Promise.all(
      tabIds.map(async (id) => {
        try {
          const tab = await chrome.tabs.get(id);
          return { id, title: tab.title || 'Untitled', url: tab.url || '' };
        } catch (err) {
          return { id, title: 'Error loading tab', url: '' };
        }
      })
    );
  } catch (err) {
    try {
      const tab = await chrome.tabs.get(tabId);
      return [{ id: tabId, title: tab.title || 'Untitled', url: tab.url || '' }];
    } catch {
      return [{ id: tabId, title: 'Error loading tab', url: '' }];
    }
  }
}

export async function getEffectiveTabId(
  mgr: TabGroupManager,
  requestedTabId: number | undefined,
  currentTabId: number
): Promise<number> {
  if (void 0 === requestedTabId) return currentTabId;
  if (!(await isTabInSameGroup(mgr, currentTabId, requestedTabId))) {
    const validIds = await getValidTabIds(mgr, currentTabId);
    throw new Error(
      `Tab ${requestedTabId} is not in the same group as the current tab. Valid tab IDs are: ${validIds.join(', ')}`
    );
  }
  return requestedTabId;
}
