import type { TabGroupManager } from './tabGroups';
import { BrowserSessionConflictError, tabLeaseManager, type TabLeaseOrigin } from './tabLeases';
import { buildGroupAppearanceUpdate } from './tabGroupAppearance';
import type { BrowserSessionScope } from '../sessionScope';
import type { ToolTabAccess } from '../pageToolsSupport/types';

interface BrowserSessionToolContext {
  browserSessionScope: BrowserSessionScope;
  tabAccess: ToolTabAccess;
}

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

async function getValidTabIds(mgr: TabGroupManager, tabId: number): Promise<number[]> {
  try {
    await mgr.initialize();
    const mainTabId = await mgr.getMainTabId(tabId);
    if (!mainTabId) return [tabId];
    return (await mgr.getGroupDetails(mainTabId)).memberTabs.map((m) => m.tabId);
  } catch (err) {
    return [tabId];
  }
}

export async function getValidTabsWithMetadataForContext(
  mgr: TabGroupManager,
  tabId: number,
  context: BrowserSessionToolContext
): Promise<{ id: number; title: string; url: string }[]> {
  const sessionId = context.browserSessionScope.sessionId;
  const tabIds = await getValidTabIds(mgr, tabId);
  const visibleTabIds: number[] = [];
  for (const id of tabIds) {
    const lease = await tabLeaseManager.getLease(id);
    if (!lease || lease.sessionId === sessionId) visibleTabIds.push(id);
  }
  return await Promise.all(
    visibleTabIds.map(async (id) => {
      try {
        const tab = await chrome.tabs.get(id);
        return { id, title: tab.title || 'Untitled', url: tab.url || '' };
      } catch (err) {
        return { id, title: 'Error loading tab', url: '' };
      }
    })
  );
}

async function resolveTabInCurrentGroup(
  mgr: TabGroupManager,
  requestedTabId: number | undefined,
  currentTabId: number
): Promise<number> {
  if (void 0 === requestedTabId) return currentTabId;
  if (requestedTabId === currentTabId) return currentTabId;
  if (!(await isTabInSameGroup(mgr, currentTabId, requestedTabId))) {
    const validIds = await getValidTabIds(mgr, currentTabId);
    throw new Error(
      `Tab ${requestedTabId} is not in the same group as the current tab. Valid tab IDs are: ${validIds.join(', ')}`
    );
  }
  return requestedTabId;
}

async function markManagedGroupActiveForSession(
  mgr: TabGroupManager,
  chromeGroupId: number,
  sessionId: string
): Promise<void> {
  for (const meta of mgr.groupMetadata.values()) {
    if (meta.chromeGroupId !== chromeGroupId) continue;
    const changed = meta.sessionId !== sessionId || meta.status !== 'active';
    meta.sessionId = sessionId;
    meta.status = 'active';
    if (changed) await mgr.saveToStorage();
    try {
      await chrome.tabGroups.update(chromeGroupId, buildGroupAppearanceUpdate(mgr, meta));
    } catch {
      // Group may have been closed or moved while the tool was resolving tabs.
    }
    return;
  }
}

export async function resolveTabForContext(
  mgr: TabGroupManager,
  requestedTabId: number | undefined,
  currentTabId: number,
  context: BrowserSessionToolContext
): Promise<number> {
  const effectiveTabId = await resolveTabInCurrentGroup(mgr, requestedTabId, currentTabId);
  const sessionId = context.browserSessionScope.sessionId;
  const tabAccess = context.tabAccess;
  const existingLease = await tabLeaseManager.getLease(effectiveTabId);
  if (existingLease) {
    if (existingLease.sessionId !== sessionId) {
      throw new BrowserSessionConflictError(effectiveTabId, existingLease.sessionId);
    }
    if (tabAccess === 'read') return effectiveTabId;
    await tabLeaseManager.claimTab(sessionId, effectiveTabId, existingLease.origin, {
      groupId: existingLease.groupId
    });
    if (typeof existingLease.groupId === 'number') {
      await markManagedGroupActiveForSession(mgr, existingLease.groupId, sessionId);
    }
    return effectiveTabId;
  }

  if (tabAccess === 'read') return effectiveTabId;

  await mgr.initialize();
  await chrome.tabs.get(effectiveTabId);
  const group = await mgr.findGroupByTab(effectiveTabId);
  const origin = (group?.memberStates.get(effectiveTabId)?.origin ?? 'user') as TabLeaseOrigin;
  const managedGroupId = group && !group.isUnmanaged ? group.chromeGroupId : undefined;
  await tabLeaseManager.claimTab(sessionId, effectiveTabId, origin, {
    groupId: managedGroupId
  });
  if (typeof managedGroupId === 'number') {
    await markManagedGroupActiveForSession(mgr, managedGroupId, sessionId);
  }
  return effectiveTabId;
}
