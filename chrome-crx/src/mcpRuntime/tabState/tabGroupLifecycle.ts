import type { TabGroupManager } from './tabGroups';
import {
  TAB_GROUP_TITLE,
  type AddTabToGroupOptions,
  type CreateGroupOptions,
  type GroupMetadata,
  type GroupWithMembers
} from './types';
import { getMemberOrigin } from './tabNavigationIsolation';
import { removeManagedGroupMetadata } from './tabGroupFinalize';

export async function createGroup(
  mgr: TabGroupManager,
  tabId: number,
  options: CreateGroupOptions = {}
): Promise<GroupWithMembers> {
  const existing = await mgr.findGroupByMainTab(tabId);
  if (existing) return existing;
  const tab = await chrome.tabs.get(tabId);
  let chromeGroupId: number | undefined;
  let domain = 'blank';
  if (
    tab.url &&
    '' !== tab.url &&
    !tab.url.startsWith('chrome://') &&
    !tab.url.startsWith('edge://') &&
    !tab.url.startsWith('brave://')
  )
    try {
      domain = new URL(tab.url).hostname || 'blank';
    } catch {
      domain = 'blank';
    }
  if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    mgr.findMainTabInChromeGroup(tab.groupId) || (await chrome.tabs.ungroup([tabId]));
  }
  let retries = 3;
  for (; retries > 0; )
    try {
      chromeGroupId = await chrome.tabs.group({ tabIds: [tabId] });
      break;
    } catch (err) {
      if ((retries--, 0 === retries)) throw err;
      await new Promise((r) => setTimeout(r, 100));
    }
  if (!chromeGroupId) throw new Error('Failed to create Chrome tab group');
  await chrome.tabGroups.update(chromeGroupId, {
    title: TAB_GROUP_TITLE,
    color: chrome.tabGroups.Color.ORANGE,
    collapsed: false
  });
  const metadata: GroupMetadata = {
    mainTabId: tabId,
    createdAt: Date.now(),
    domain,
    chromeGroupId,
    memberStates: new Map()
  };
  metadata.memberStates.set(tabId, {
    indicatorState: 'none',
    origin: options.origin ?? 'user',
    disposition: 'active'
  });
  mgr.groupMetadata.set(tabId, metadata);
  await mgr.saveToStorage();
  const members = await mgr.getGroupMembers(chromeGroupId);
  return { ...metadata, memberTabs: members };
}

export async function adoptOrphanedGroup(
  mgr: TabGroupManager,
  tabId: number,
  chromeGroupId: number
): Promise<GroupWithMembers> {
  const existing = await mgr.findGroupByMainTab(tabId);
  if (existing) return existing;
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url) throw new Error('Tab has no URL');
  const domain = new URL(tab.url).hostname;
  if (tab.groupId !== chromeGroupId)
    throw new Error(`Tab ${tabId} is not in Chrome group ${chromeGroupId}`);
  const metadata: GroupMetadata = {
    mainTabId: tabId,
    createdAt: Date.now(),
    domain,
    chromeGroupId,
    memberStates: new Map()
  };
  metadata.memberStates.set(tabId, {
    indicatorState: 'none',
    origin: 'user',
    disposition: 'active'
  });
  const groupTabs = await chrome.tabs.query({ groupId: chromeGroupId });
  for (const t of groupTabs)
    t.id &&
      t.id !== tabId &&
      metadata.memberStates.set(t.id, {
        indicatorState: 'static',
        origin: 'user',
        disposition: 'active'
      });
  mgr.groupMetadata.set(tabId, metadata);
  await mgr.saveToStorage();
  const members = await mgr.getGroupMembers(chromeGroupId);
  return { ...metadata, memberTabs: members };
}

export async function addTabToGroup(
  mgr: TabGroupManager,
  mainTabId: number,
  tabId: number,
  options: AddTabToGroupOptions = {}
): Promise<void> {
  const meta = mgr.groupMetadata.get(mainTabId);
  if (meta) {
    try {
      await chrome.tabs.group({
        tabIds: [tabId],
        groupId: meta.chromeGroupId
      });
      const existingState = meta.memberStates.get(tabId);
      meta.memberStates.set(tabId, {
        ...(existingState ?? {}),
        indicatorState: existingState?.indicatorState ?? (tabId === mainTabId ? 'none' : 'static'),
        origin: options.origin ?? getMemberOrigin(existingState),
        disposition: 'active'
      });
      try {
        const tab = await chrome.tabs.get(tabId);
        tab.url && (await mgr.updateTabBlocklistStatus(tabId, tab.url));
      } catch (err) {
        // ignore
      }
      const isDismissed = await mgr.isGroupDismissed(meta.chromeGroupId);
      if (tabId !== mainTabId && !isDismissed)
        try {
          await chrome.tabs.sendMessage(tabId, {
            type: 'SHOW_STATIC_INDICATOR'
          });
        } catch {
          // ignore
        }
    } catch (err) {
      // ignore
    }
    await mgr.saveToStorage();
  }
}

export async function deleteGroup(mgr: TabGroupManager, mainTabId: number): Promise<void> {
  const meta = mgr.groupMetadata.get(mainTabId);
  if (meta) {
    try {
      const tabs = await chrome.tabs.query({
        groupId: meta.chromeGroupId
      });
      const tabIds = tabs.map((t) => t.id).filter((id) => void 0 !== id) as number[];
      if (tabIds.length > 0)
        try {
          for (const tab of tabs)
            if (tab.id)
              try {
                await chrome.tabs.sendMessage(tab.id, {
                  type: 'HIDE_AGENT_INDICATORS'
                });
                await chrome.tabs.sendMessage(tab.id, {
                  type: 'HIDE_STATIC_INDICATOR'
                });
              } catch {
                // ignore
              }
        } catch (err) {
          // ignore
        }
      await new Promise((r) => setTimeout(r, 100));
      tabIds.length > 0 && (await chrome.tabs.ungroup(tabIds as [number, ...number[]]));
    } catch (err) {
      // ignore
    }
    await removeManagedGroupMetadata(mgr, meta);
    await mgr.saveToStorage();
  }
}

export async function clearAllGroups(mgr: TabGroupManager): Promise<void> {
  const keys = Array.from(mgr.groupMetadata.keys());
  for (const key of keys) await deleteGroup(mgr, key);
  mgr.groupMetadata.clear();
  await mgr.saveToStorage();
}

export async function clearAll(mgr: TabGroupManager): Promise<void> {
  await clearAllGroups(mgr);
  mgr.initialized = false;
}

export async function cleanupOldGroup(
  mgr: TabGroupManager,
  oldGroupId: number,
  excludeTabId: number
): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ groupId: oldGroupId });
    for (const tab of tabs)
      if (tab.id && tab.id !== excludeTabId)
        try {
          await mgr.sendIndicatorMessage(tab.id, 'HIDE_STATIC_INDICATOR');
        } catch {
          // ignore
        }
    const tabIds = tabs.flatMap((tab) =>
      typeof tab.id === 'number' && tab.id !== excludeTabId ? [tab.id] : []
    );
    const [firstTabId, ...remainingTabIds] = tabIds;
    if (firstTabId !== undefined) {
      await chrome.tabs.ungroup([firstTabId, ...remainingTabIds]);
    }
  } catch (err) {
    // ignore
  }
}

export async function handleTabClosed(mgr: TabGroupManager, tabId: number): Promise<void> {
  mgr.groupMetadata.has(tabId) && (await deleteGroup(mgr, tabId));
}
