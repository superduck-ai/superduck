import type { TabGroupManager } from './tabGroups';
import type { GroupMetadata, GroupMemberTab, GroupWithMembers } from './types';

export function findMainTabInChromeGroup(
  mgr: TabGroupManager,
  chromeGroupId: number
): number | null {
  for (const [mainTabId, meta] of mgr.groupMetadata.entries())
    if (meta.chromeGroupId === chromeGroupId) return mainTabId;
  return null;
}

export async function getGroupMembers(
  mgr: TabGroupManager,
  chromeGroupId: number
): Promise<GroupMemberTab[]> {
  const tabs = await chrome.tabs.query({ groupId: chromeGroupId });
  let matchingMeta: GroupMetadata | undefined;
  for (const [, meta] of mgr.groupMetadata.entries())
    if (meta.chromeGroupId === chromeGroupId) {
      matchingMeta = meta;
      break;
    }
  return tabs.flatMap((tab) => {
    if (typeof tab.id !== 'number') {
      return [];
    }

    const state = matchingMeta?.memberStates.get(tab.id);
    return [
      {
        tabId: tab.id,
        url: tab.url || '',
        title: tab.title || '',
        joinedAt: Date.now(),
        indicatorState: state?.indicatorState || 'none'
      }
    ];
  });
}

export async function getGroupDetails(
  mgr: TabGroupManager,
  mainTabId: number
): Promise<GroupWithMembers> {
  const meta = mgr.groupMetadata.get(mainTabId);
  if (!meta) throw new Error(`No group found for main tab ${mainTabId}`);
  const members = await getGroupMembers(mgr, meta.chromeGroupId);
  return { ...meta, memberTabs: members };
}

export async function getAllGroups(mgr: TabGroupManager): Promise<GroupWithMembers[]> {
  await mgr.initialize();
  const groups: GroupWithMembers[] = [];
  for (const [, meta] of mgr.groupMetadata.entries())
    try {
      const members = await getGroupMembers(mgr, meta.chromeGroupId);
      groups.push({ ...meta, memberTabs: members });
    } catch (err) {
      // ignore
    }
  return groups;
}

export async function findGroupByTab(
  mgr: TabGroupManager,
  tabId: number
): Promise<GroupWithMembers | null> {
  await mgr.initialize();
  const meta = mgr.groupMetadata.get(tabId);
  if (meta) {
    const members = await getGroupMembers(mgr, meta.chromeGroupId);
    return { ...meta, memberTabs: members };
  }
  const tab = await chrome.tabs.get(tabId);
  if (tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return null;
  for (const [, groupMeta] of mgr.groupMetadata.entries())
    if (groupMeta.chromeGroupId === tab.groupId) {
      const members = await getGroupMembers(mgr, groupMeta.chromeGroupId);
      return { ...groupMeta, memberTabs: members };
    }
  const groupTabs = await chrome.tabs.query({ groupId: tab.groupId });
  if (0 === groupTabs.length) return null;
  groupTabs.sort((a, b) => a.index - b.index);
  const firstTab = groupTabs[0];
  if (!firstTab.id || !firstTab.url) return null;
  return {
    mainTabId: firstTab.id,
    createdAt: Date.now(),
    domain: new URL(firstTab.url).hostname,
    chromeGroupId: tab.groupId,
    memberStates: new Map(),
    memberTabs: groupTabs.flatMap((groupTab) =>
      typeof groupTab.id === 'number'
        ? [
            {
              tabId: groupTab.id,
              url: groupTab.url || '',
              title: groupTab.title || '',
              joinedAt: Date.now()
            }
          ]
        : []
    ),
    isUnmanaged: true
  };
}

export async function findGroupByMainTab(
  mgr: TabGroupManager,
  mainTabId: number
): Promise<GroupWithMembers | null> {
  await mgr.initialize();
  const meta = mgr.groupMetadata.get(mainTabId);
  if (!meta) return null;
  try {
    const members = await getGroupMembers(mgr, meta.chromeGroupId);
    return { ...meta, memberTabs: members };
  } catch (err) {
    return null;
  }
}

export async function findOrphanedTabs(mgr: TabGroupManager): Promise<
  {
    tabId: number;
    url: string;
    title: string;
    openerTabId: number;
    detectedAt: number;
  }[]
> {
  const orphaned: {
    tabId: number;
    url: string;
    title: string;
    openerTabId: number;
    detectedAt: number;
  }[] = [];
  const seen = new Set<number>();
  const ungroupedTabs = await chrome.tabs.query({
    groupId: chrome.tabGroups.TAB_GROUP_ID_NONE
  });
  const knownTabIds = new Set<number>();
  for (const [mainTabId] of mgr.groupMetadata.entries()) {
    knownTabIds.add(mainTabId);
    const group = await findGroupByMainTab(mgr, mainTabId);
    group && group.memberTabs.forEach((m) => knownTabIds.add(m.tabId));
  }
  for (const tab of ungroupedTabs) {
    if (!tab.id || seen.has(tab.id) || knownTabIds.has(tab.id)) continue;
    seen.add(tab.id);
    tab.openerTabId &&
      knownTabIds.has(tab.openerTabId) &&
      tab.url &&
      !tab.url.startsWith('chrome://') &&
      !tab.url.startsWith('chrome-extension://') &&
      !tab.url.startsWith('edge://') &&
      !tab.url.startsWith('brave://') &&
      !('about:blank' === tab.url) &&
      orphaned.push({
        tabId: tab.id,
        url: tab.url || '',
        title: tab.title || '',
        openerTabId: tab.openerTabId,
        detectedAt: Date.now()
      });
  }
  return orphaned;
}

export async function isInGroup(mgr: TabGroupManager, tabId: number): Promise<boolean> {
  return null !== (await findGroupByTab(mgr, tabId));
}

export function isMainTab(mgr: TabGroupManager, tabId: number): boolean {
  return mgr.groupMetadata.has(tabId);
}

export function findMainTabIdSync(mgr: TabGroupManager, tabId: number): number | undefined {
  if (mgr.groupMetadata.has(tabId)) return tabId;
  for (const [mainTabId, meta] of mgr.groupMetadata.entries()) {
    if (meta.memberStates.has(tabId)) return mainTabId;
  }
  return undefined;
}

export function getGroupMemberIds(mgr: TabGroupManager, mainTabId: number): number[] {
  const meta = mgr.groupMetadata.get(mainTabId);
  if (!meta) return [];
  return Array.from(meta.memberStates.keys());
}

export async function getMainTabId(mgr: TabGroupManager, tabId: number): Promise<number | null> {
  const group = await findGroupByTab(mgr, tabId);
  return group?.mainTabId || null;
}

export async function getGroup(
  mgr: TabGroupManager,
  mainTabId: number
): Promise<GroupWithMembers | undefined> {
  return (await findGroupByMainTab(mgr, mainTabId)) || void 0;
}
