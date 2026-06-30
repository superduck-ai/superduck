import type { TabGroupManager } from './tabGroups';
import { StorageKeys } from '../../extensionServices';
import { TAB_GROUP_TITLE, type GroupMetadata } from './types';

export async function addTabToIndicatorGroup(
  mgr: TabGroupManager,
  options: { tabId: number; isRunning: boolean; isMcp?: boolean }
): Promise<void> {
  const { tabId, isRunning, isMcp } = options;
  const state = mgr.isMainTab(tabId) && isRunning ? 'pulsing' : 'static';
  await mgr.setTabIndicatorState(tabId, state, isMcp);
}

export async function getTabForMcp(
  mgr: TabGroupManager,
  tabId?: number,
  tabGroupId?: number
): Promise<{ tabId: number | undefined; domain?: string; url?: string }> {
  if ((await mgr.initialize(), await loadMcpTabGroupId(mgr), void 0 !== tabId))
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab) {
        const group = await mgr.findGroupByTab(tabId);
        let domain: string | undefined;
        group &&
          ((mgr.mcpTabGroupId = group.chromeGroupId),
          await saveMcpTabGroupId(mgr),
          await ensureMcpGroupCharacteristics(mgr, group.chromeGroupId));
        const tabUrl =
          tab.url &&
          !tab.url.startsWith('chrome://') &&
          !tab.url.startsWith('edge://') &&
          !tab.url.startsWith('brave://')
            ? tab.url
            : void 0;
        if (tabUrl)
          try {
            domain = new URL(tabUrl).hostname || void 0;
          } catch {
            // ignore
          }
        return { tabId, domain, url: tabUrl };
      }
    } catch {
      throw new Error(`Tab ${tabId} does not exist`);
    }
  if (void 0 !== tabGroupId) {
    for (const [mainId, meta] of mgr.groupMetadata.entries())
      if (meta.chromeGroupId === tabGroupId)
        try {
          const tab = await chrome.tabs.get(mainId);
          if (tab) {
            const tabUrl =
              tab.url &&
              !tab.url.startsWith('chrome://') &&
              !tab.url.startsWith('edge://') &&
              !tab.url.startsWith('brave://')
                ? tab.url
                : void 0;
            return { tabId: mainId, domain: meta.domain, url: tabUrl };
          }
        } catch {
          break;
        }
    try {
      const tabs = await chrome.tabs.query({ groupId: tabGroupId });
      if (tabs.length > 0 && tabs[0].id) {
        let domain: string | undefined;
        const tabUrl = tabs[0].url;
        const url =
          tabUrl &&
          !tabUrl.startsWith('chrome://') &&
          !tabUrl.startsWith('edge://') &&
          !tabUrl.startsWith('brave://')
            ? tabUrl
            : void 0;
        if (url)
          try {
            domain = new URL(url).hostname || void 0;
          } catch {
            // ignore
          }
        return { tabId: tabs[0].id, domain, url };
      }
    } catch {
      // ignore
    }
    throw new Error(`Could not find tab group ${tabGroupId}`);
  }
  if (mgr.mcpTabGroupId !== null) {
    try {
      await chrome.tabGroups.get(mgr.mcpTabGroupId);
      await ensureMcpGroupCharacteristics(mgr, mgr.mcpTabGroupId);
      const tabs = (await chrome.tabs.query({ groupId: mgr.mcpTabGroupId }))
        .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
        .sort((a, b) => {
          if (a.windowId !== b.windowId) return a.windowId - b.windowId;
          return (a.index ?? 0) - (b.index ?? 0);
        });
      const tab = tabs[0];
      if (tab) {
        let domain: string | undefined;
        const tabUrl = tab.url;
        const url =
          tabUrl &&
          !tabUrl.startsWith('chrome://') &&
          !tabUrl.startsWith('edge://') &&
          !tabUrl.startsWith('brave://')
            ? tabUrl
            : void 0;
        if (url)
          try {
            domain = new URL(url).hostname || void 0;
          } catch {
            // ignore
          }
        return { tabId: tab.id, domain, url };
      }
    } catch {
      await clearMcpTabGroup(mgr);
    }
  }
  return { tabId: void 0 };
}

export async function isTabMcp(mgr: TabGroupManager, tabId: number): Promise<boolean> {
  if (
    !(
      true ===
      (await chrome.storage.local.get(StorageKeys.MCP_CONNECTED))[StorageKeys.MCP_CONNECTED]
    )
  )
    return false;
  if ((await loadMcpTabGroupId(mgr), null === mgr.mcpTabGroupId)) return false;
  for (const [, meta] of mgr.groupMetadata.entries())
    if (meta.chromeGroupId === mgr.mcpTabGroupId && meta.memberStates.has(tabId)) return true;
  return false;
}

export async function ensureMcpGroupCharacteristics(
  mgr: TabGroupManager,
  chromeGroupId: number
): Promise<void> {
  try {
    const group = await chrome.tabGroups.get(chromeGroupId);
    (group.title === TAB_GROUP_TITLE && group.color === chrome.tabGroups.Color.ORANGE) ||
      (await chrome.tabGroups.update(chromeGroupId, {
        title: TAB_GROUP_TITLE,
        color: chrome.tabGroups.Color.ORANGE
      }));
  } catch {
    // ignore
  }
}

export async function clearMcpTabGroup(mgr: TabGroupManager): Promise<void> {
  mgr.mcpTabGroupId = null;
  await chrome.storage.local.remove(mgr.MCP_TAB_GROUP_KEY as string);
  await chrome.storage.local.remove(mgr.MCP_TAB_GROUP_OWNER_KEY as string);
}

export async function getOrCreateMcpTabContext(
  mgr: TabGroupManager,
  options?: { createIfEmpty?: boolean }
): Promise<
  | {
      currentTabId: number;
      availableTabs: { id: number; title: string; url: string }[];
      tabCount: number;
      tabGroupId: number;
    }
  | undefined
> {
  const { createIfEmpty = false } = options || {};
  if ((await loadMcpTabGroupId(mgr), null !== mgr.mcpTabGroupId))
    try {
      await chrome.tabGroups.get(mgr.mcpTabGroupId);
      await ensureMcpGroupCharacteristics(mgr, mgr.mcpTabGroupId);
      const tabs = (await chrome.tabs.query({ groupId: mgr.mcpTabGroupId })).flatMap((tab) =>
        typeof tab.id === 'number'
          ? [{ id: tab.id, title: tab.title || '', url: tab.url || '' }]
          : []
      );
      if (tabs.length > 0)
        return {
          currentTabId: tabs[0].id,
          availableTabs: tabs,
          tabCount: tabs.length,
          tabGroupId: mgr.mcpTabGroupId
        };
    } catch {
      mgr.mcpTabGroupId = null;
      await saveMcpTabGroupId(mgr);
    }
  if (createIfEmpty) {
    return await createMcpTabGroup(mgr, { active: false });
  }
}

export async function createMcpTabGroup(
  mgr: TabGroupManager,
  options?: { active?: boolean }
): Promise<{
  currentTabId: number;
  availableTabs: { id: number; title: string; url: string }[];
  tabCount: number;
  tabGroupId: number;
}> {
  const newTab = await chrome.tabs.create({
    url: 'chrome://newtab',
    active: options?.active ?? false
  });
  const newTabId = newTab?.id;
  if (!newTabId) throw new Error('Failed to create MCP tab');

  const group = await mgr.createGroup(newTabId, { origin: 'agent' });
  mgr.mcpTabGroupId = group.chromeGroupId;
  await saveMcpTabGroupId(mgr);

  const availableTabs = (await chrome.tabs.query({ groupId: group.chromeGroupId })).flatMap(
    (tab) =>
      typeof tab.id === 'number' ? [{ id: tab.id, title: tab.title || '', url: tab.url || '' }] : []
  );

  return {
    currentTabId: newTabId,
    availableTabs:
      availableTabs.length > 0
        ? availableTabs
        : [
            { id: newTabId, title: newTab.title || 'New Tab', url: newTab.url || 'chrome://newtab' }
          ],
    tabCount: availableTabs.length || 1,
    tabGroupId: group.chromeGroupId
  };
}

export async function saveMcpTabGroupId(mgr: TabGroupManager): Promise<void> {
  await chrome.storage.local.set({
    [mgr.MCP_TAB_GROUP_KEY]: mgr.mcpTabGroupId,
    [mgr.MCP_TAB_GROUP_OWNER_KEY]: mgr.mcpTabGroupId
  });
}

export async function loadMcpTabGroupId(mgr: TabGroupManager): Promise<void> {
  try {
    await loadStoredMcpTabGroupId(mgr);
    if (mgr.mcpTabGroupId !== null) return;
    const found = await findMcpTabGroupByCharacteristics(mgr);
    if (null !== found) {
      mgr.mcpTabGroupId = found;
      return;
    }
    mgr.mcpTabGroupId = null;
  } catch {
    mgr.mcpTabGroupId = null;
  }
}

export async function loadStoredMcpTabGroupId(mgr: TabGroupManager): Promise<void> {
  try {
    const storedData = await chrome.storage.local.get([
      mgr.MCP_TAB_GROUP_KEY,
      mgr.MCP_TAB_GROUP_OWNER_KEY
    ] as string[]);
    const stored = storedData[mgr.MCP_TAB_GROUP_KEY];
    if ('number' == typeof stored)
      try {
        await chrome.tabGroups.get(stored);
        if (storedData[mgr.MCP_TAB_GROUP_OWNER_KEY] === stored) {
          mgr.mcpTabGroupId = stored;
          return;
        }
        const meta = findMetadataByChromeGroupId(mgr, stored);
        if (meta && migrateLegacyStoredMcpGroup(meta)) {
          mgr.mcpTabGroupId = stored;
          await saveMcpTabGroupId(mgr);
          await mgr.saveToStorage();
          return;
        }
        await clearMcpTabGroup(mgr).catch(() => {});
        return;
      } catch {
        await clearMcpTabGroup(mgr).catch(() => {});
        return;
      }
    mgr.mcpTabGroupId = null;
  } catch {
    mgr.mcpTabGroupId = null;
  }
}

export function findMetadataByChromeGroupId(mgr: TabGroupManager, chromeGroupId: number) {
  for (const meta of mgr.groupMetadata.values())
    if (meta.chromeGroupId === chromeGroupId) return meta;
  return undefined;
}

export async function isStoredMcpChromeGroup(
  mgr: TabGroupManager,
  chromeGroupId: number
): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get([
      mgr.MCP_TAB_GROUP_KEY,
      mgr.MCP_TAB_GROUP_OWNER_KEY
    ] as string[]);
    return (
      stored[mgr.MCP_TAB_GROUP_KEY] === chromeGroupId &&
      stored[mgr.MCP_TAB_GROUP_OWNER_KEY] === chromeGroupId
    );
  } catch {
    return false;
  }
}

export async function isCurrentMcpChromeGroup(
  mgr: TabGroupManager,
  chromeGroupId: number
): Promise<boolean> {
  if (mgr.mcpTabGroupId === chromeGroupId) return true;
  try {
    const stored = (await chrome.storage.local.get(mgr.MCP_TAB_GROUP_KEY))[mgr.MCP_TAB_GROUP_KEY];
    return stored === chromeGroupId;
  } catch {
    return false;
  }
}

export async function updateMcpTabGroupIdAfterRegroup(
  mgr: TabGroupManager,
  oldChromeGroupId: number,
  newChromeGroupId: number
): Promise<void> {
  if (mgr.mcpTabGroupId === oldChromeGroupId) mgr.mcpTabGroupId = newChromeGroupId;
  if (await isStoredMcpChromeGroup(mgr, oldChromeGroupId)) {
    mgr.mcpTabGroupId = newChromeGroupId;
    await saveMcpTabGroupId(mgr);
  }
}

export function migrateLegacyStoredMcpGroup(meta: GroupMetadata): boolean {
  const hasMcpMember = Array.from(meta.memberStates.values()).some(
    (memberState) => memberState.isMcp === true
  );
  if (!meta.hasLegacyMemberOrigins && !hasMcpMember) return false;

  for (const [tabId, memberState] of meta.memberStates.entries()) {
    meta.memberStates.set(tabId, {
      ...memberState,
      origin: 'agent',
      disposition: memberState.disposition ?? 'active'
    });
  }
  meta.hasLegacyMemberOrigins = false;
  return true;
}

export async function findMcpTabGroupByCharacteristics(
  _mgr: TabGroupManager
): Promise<number | null> {
  try {
    const groups = await chrome.tabGroups.query({});
    for (const group of groups)
      if (group.color === chrome.tabGroups.Color.ORANGE && group.title?.includes(TAB_GROUP_TITLE)) {
        if ((await chrome.tabs.query({ groupId: group.id })).length > 0) return group.id;
      }
    return null;
  } catch {
    return null;
  }
}
