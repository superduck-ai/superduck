import type { TabGroupManager } from './tabGroups';
import { DomainCategoryCache } from './domainCategory';
import * as indicators from './tabGroupIndicators';
import type { BlockedTabInfo, GroupBlocklistStatus } from './types';

export function getMostRestrictiveCategory(categories: (string | undefined)[]): string | undefined {
  const weights: Record<string, number> = {
    category3: 2,
    category2: 3,
    category_org_blocked: 3,
    category1: 4,
    category0: 1
  };
  let result: string | undefined;
  let maxWeight = 0;
  for (const cat of categories)
    cat && weights[cat] > maxWeight && ((maxWeight = weights[cat]), (result = cat));
  return result;
}

export function notifyBlocklistListeners(
  mgr: TabGroupManager,
  groupId: number,
  category: string | undefined
): void {
  for (const listener of mgr.blocklistListeners)
    try {
      listener(groupId, category);
    } catch {
      // ignore
    }
}

export async function updateTabBlocklistStatus(
  mgr: TabGroupManager,
  tabId: number,
  url: string
): Promise<void> {
  const group = await mgr.findGroupByTab(tabId);
  if (!group || group.isUnmanaged) return;
  const isBlockedHtml = url.includes('blocked.html');
  const category = isBlockedHtml ? 'category1' : await DomainCategoryCache.getCategory(url);
  await updateGroupBlocklistStatus(mgr, group.chromeGroupId, tabId, category, isBlockedHtml);
}

export async function removeTabFromBlocklistTracking(
  mgr: TabGroupManager,
  groupId: number,
  tabId: number
): Promise<void> {
  const status = mgr.groupBlocklistStatuses.get(groupId);
  status &&
    (status.categoriesByTab.delete(tabId),
    status.blockedHtmlTabs.delete(tabId),
    await recalculateGroupBlocklistStatus(mgr, groupId));
}

export async function updateGroupBlocklistStatus(
  mgr: TabGroupManager,
  groupId: number,
  tabId: number,
  category: string | undefined,
  isBlockedHtml = false
): Promise<void> {
  let status = mgr.groupBlocklistStatuses.get(groupId);
  status ||
    ((status = {
      groupId,
      mostRestrictiveCategory: void 0,
      categoriesByTab: new Map(),
      blockedHtmlTabs: new Set(),
      lastChecked: Date.now()
    }),
    mgr.groupBlocklistStatuses.set(groupId, status));
  status.categoriesByTab.set(tabId, category);
  isBlockedHtml ? status.blockedHtmlTabs.add(tabId) : status.blockedHtmlTabs.delete(tabId);
  await recalculateGroupBlocklistStatus(mgr, groupId);
}

export async function recalculateGroupBlocklistStatus(
  mgr: TabGroupManager,
  groupId: number
): Promise<void> {
  const status = mgr.groupBlocklistStatuses.get(groupId);
  if (!status) return;
  const previousCategory = status.mostRestrictiveCategory;
  const categories = Array.from(status.categoriesByTab.values());
  status.mostRestrictiveCategory = getMostRestrictiveCategory(categories);
  status.lastChecked = Date.now();
  previousCategory !== status.mostRestrictiveCategory &&
    notifyBlocklistListeners(mgr, groupId, status.mostRestrictiveCategory);
}

export async function getGroupBlocklistStatus(
  mgr: TabGroupManager,
  mainTabId: number
): Promise<string | undefined> {
  await mgr.initialize();
  const group = await mgr.findGroupByMainTab(mainTabId);
  if (!group) {
    const tab = await chrome.tabs.get(mainTabId);
    return await DomainCategoryCache.getCategory(tab.url || '');
  }
  const status = mgr.groupBlocklistStatuses.get(group.chromeGroupId);
  (!status || Date.now() - status.lastChecked > 5000) &&
    (await checkAllTabsInGroupForBlocklist(mgr, group.chromeGroupId));
  return mgr.groupBlocklistStatuses.get(group.chromeGroupId)?.mostRestrictiveCategory;
}

export async function getBlockedTabsInfo(
  mgr: TabGroupManager,
  mainTabId: number
): Promise<{ isMainTabBlocked: boolean; blockedTabs: BlockedTabInfo[] }> {
  await mgr.initialize();
  const group = await mgr.findGroupByMainTab(mainTabId);
  const blockedTabs: BlockedTabInfo[] = [];
  let isMainTabBlocked = false;
  if (!group) {
    const tab = await chrome.tabs.get(mainTabId);
    if (tab.url?.includes('blocked.html'))
      ((isMainTabBlocked = true),
        blockedTabs.push({
          tabId: mainTabId,
          title: tab.title || 'Untitled',
          url: tab.url || '',
          category: 'category1'
        }));
    else {
      const category = await DomainCategoryCache.getCategory(tab.url || '');
      category &&
        'category0' !== category &&
        ((isMainTabBlocked = true),
        blockedTabs.push({
          tabId: mainTabId,
          title: tab.title || 'Untitled',
          url: tab.url || '',
          category
        }));
    }
    return { isMainTabBlocked, blockedTabs };
  }
  const status = mgr.groupBlocklistStatuses.get(group.chromeGroupId);
  (!status || Date.now() - status.lastChecked > 5000) &&
    (await checkAllTabsInGroupForBlocklist(mgr, group.chromeGroupId));
  const currentStatus = mgr.groupBlocklistStatuses.get(group.chromeGroupId);
  if (!currentStatus) return { isMainTabBlocked, blockedTabs };
  for (const blockedTabId of currentStatus.blockedHtmlTabs)
    try {
      const tab = await chrome.tabs.get(blockedTabId);
      blockedTabs.push({
        tabId: blockedTabId,
        title: tab.title || 'Untitled',
        url: tab.url || '',
        category: 'category1'
      });
      blockedTabId === mainTabId && (isMainTabBlocked = true);
    } catch {
      // ignore
    }
  for (const [catTabId, category] of currentStatus.categoriesByTab.entries())
    if (
      category &&
      ('category1' === category ||
        'category2' === category ||
        'category_org_blocked' === category) &&
      !currentStatus.blockedHtmlTabs.has(catTabId)
    )
      try {
        const tab = await chrome.tabs.get(catTabId);
        blockedTabs.push({
          tabId: catTabId,
          title: tab.title || 'Untitled',
          url: tab.url || '',
          category
        });
        catTabId === mainTabId && (isMainTabBlocked = true);
      } catch {
        // ignore
      }
  return { isMainTabBlocked, blockedTabs };
}

export async function checkAllTabsInGroupForBlocklist(
  mgr: TabGroupManager,
  chromeGroupId: number
): Promise<void> {
  const tabs = await chrome.tabs.query({ groupId: chromeGroupId });
  const status: GroupBlocklistStatus = {
    groupId: chromeGroupId,
    mostRestrictiveCategory: void 0,
    categoriesByTab: new Map(),
    blockedHtmlTabs: new Set(),
    lastChecked: Date.now()
  };
  for (const tab of tabs)
    if (tab.id && tab.url)
      if (tab.url.includes('blocked.html'))
        (status.blockedHtmlTabs.add(tab.id), status.categoriesByTab.set(tab.id, 'category1'));
      else {
        const category = await DomainCategoryCache.getCategory(tab.url);
        status.categoriesByTab.set(tab.id, category);
      }
  status.mostRestrictiveCategory = getMostRestrictiveCategory(
    Array.from(status.categoriesByTab.values())
  );
  mgr.groupBlocklistStatuses.set(chromeGroupId, status);
  notifyBlocklistListeners(mgr, chromeGroupId, status.mostRestrictiveCategory);
}

export function addBlocklistListener(
  mgr: TabGroupManager,
  listener: (groupId: number, category: string | undefined) => void
): void {
  mgr.blocklistListeners.add(listener);
}

export function removeBlocklistListener(
  mgr: TabGroupManager,
  listener: (groupId: number, category: string | undefined) => void
): void {
  mgr.blocklistListeners.delete(listener);
}

export function clearBlocklistCache(mgr: TabGroupManager): void {
  mgr.groupBlocklistStatuses.clear();
}

export function startTabRemovalListener(mgr: TabGroupManager): void {
  chrome.tabs.onRemoved.addListener(async (tabId: number) => {
    indicators.onTabRemoved(tabId);
    for (const [groupId, status] of mgr.groupBlocklistStatuses.entries())
      status.categoriesByTab.has(tabId) &&
        (await removeTabFromBlocklistTracking(mgr, groupId, tabId));
  });
}
