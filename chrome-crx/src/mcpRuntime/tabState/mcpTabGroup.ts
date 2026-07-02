import type { TabGroupManager } from './tabGroups';
import { StorageKeys } from '../../extensionServices';
import {
  DEFAULT_SESSION_KEY,
  TAB_GROUP_MARKER,
  TAB_GROUP_TITLE,
  type GroupMetadata
} from './types';
import {
  BrowserSessionConflictError,
  tabLeaseManager,
  type TabLease,
  type TabLeaseOrigin
} from './tabLeases';
import { resolveBrowserSessionScope, type BrowserSessionScope } from '../sessionScope';
import { buildSessionContextFromLeases, collectSessionLeases } from './sessionLeaseContext';
import { removeManagedGroupMetadata } from './tabGroupFinalize';

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
  tabGroupId?: number,
  options: { sessionId?: string } = {}
): Promise<{ tabId: number | undefined; domain?: string; url?: string }> {
  const scope = resolveBrowserSessionScope(options);
  await mgr.initialize();
  await loadMcpTabGroupId(mgr);

  if (void 0 !== tabId)
    try {
      const tab = await chrome.tabs.get(tabId);
      const group = await mgr.findGroupByTab(tabId);
      const groupId =
        group?.chromeGroupId ??
        (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE ? tab.groupId : undefined);
      if (typeof groupId === 'number') {
        mgr.mcpTabGroupId = groupId;
        await saveMcpTabGroupId(mgr);
        await ensureMcpGroupCharacteristics(mgr, groupId, scope?.sessionId);
      }
      if (scope) {
        const existingLease = await tabLeaseManager.getLease(tabId);
        if (existingLease && existingLease.sessionId !== scope.sessionId) {
          throw new BrowserSessionConflictError(tabId, existingLease.sessionId);
        }
        const memberOrigin = group?.memberStates.get(tabId)?.origin;
        const shouldClaimUnleased = !existingLease && (!isInternalBrowserUrl(tab.url) || group);
        if (existingLease) {
          await tabLeaseManager.claimTab(scope.sessionId, tabId, existingLease.origin, {
            groupId
          });
        } else if (shouldClaimUnleased) {
          await tabLeaseManager.claimTab(
            scope.sessionId,
            tabId,
            (memberOrigin ?? 'user') as TabLeaseOrigin,
            { groupId }
          );
        }
      }
      return { tabId, ...getTabRuntimeInfo(tab) };
    } catch (err) {
      if (err instanceof BrowserSessionConflictError) throw err;
      throw new Error(`Tab ${tabId} does not exist`, { cause: err });
    }

  if (void 0 !== tabGroupId) {
    try {
      const tabs = (await chrome.tabs.query({ groupId: tabGroupId }))
        .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
        .sort((a, b) => {
          if (a.windowId !== b.windowId) return a.windowId - b.windowId;
          return (a.index ?? 0) - (b.index ?? 0);
        });
      if (tabs.length > 0) {
        if (scope) {
          for (const tab of tabs) {
            await tabLeaseManager.assertTabAvailableForSession(scope.sessionId, tab.id);
          }
        }
        return await getTabForMcp(mgr, tabs[0].id, undefined, options);
      }
    } catch (err) {
      if (err instanceof BrowserSessionConflictError) throw err;
    }
    throw new Error(`Could not find tab group ${tabGroupId}`);
  }

  if (scope) {
    const context = await getSessionMcpTabContext(mgr, scope, false);
    if (context) {
      const tab = await chrome.tabs.get(context.currentTabId);
      return { tabId: context.currentTabId, ...getTabRuntimeInfo(tab) };
    }
    return { tabId: undefined };
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
      if (tab) return { tabId: tab.id, ...getTabRuntimeInfo(tab) };
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
  chromeGroupId: number,
  sessionId?: string
): Promise<void> {
  try {
    const group = await chrome.tabGroups.get(chromeGroupId);
    const hasMarker = typeof group.title === 'string' && group.title.includes(TAB_GROUP_MARKER);
    const titleOk = hasMarker || group.title === resolveGroupTitle(mgr, sessionId);
    const colorOk = group.color === chrome.tabGroups.Color.ORANGE;
    if (titleOk && colorOk) return;
    await chrome.tabGroups.update(chromeGroupId, {
      ...(titleOk ? {} : { title: resolveGroupTitle(mgr, sessionId) }),
      ...(colorOk ? {} : { color: chrome.tabGroups.Color.ORANGE })
    });
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
  options?: { createIfEmpty?: boolean; name?: string; sessionId?: string }
): Promise<
  | {
      currentTabId: number;
      availableTabs: { id: number; title: string; url: string }[];
      tabCount: number;
      tabGroupId: number;
    }
  | undefined
> {
  const { createIfEmpty = false, name } = options || {};
  const scope = resolveBrowserSessionScope(options);
  if (scope) {
    return await getSessionMcpTabContext(mgr, scope, createIfEmpty, name);
  }
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
    return await createMcpTabGroup(mgr, { active: false, name });
  }
}

export async function createMcpTabGroup(
  mgr: TabGroupManager,
  options?: {
    active?: boolean;
    sessionId?: string;
    replaceExisting?: boolean;
    name?: string;
  }
): Promise<{
  currentTabId: number;
  availableTabs: { id: number; title: string; url: string }[];
  tabCount: number;
  tabGroupId: number;
}> {
  const scope = resolveBrowserSessionScope(options);
  if (scope) {
    const existing = await getSessionMcpTabContext(mgr, scope, false);
    if (existing && options?.replaceExisting !== true) {
      throw new Error(
        `Session already has MCP tab group ${existing.tabGroupId}; use tab_group list --create-if-empty to reuse tab ${existing.currentTabId}, or pass --force to replace it.`
      );
    }
    if (options?.replaceExisting === true) {
      if (existing) {
        await disposeSessionGroup(mgr, existing.tabGroupId);
      }
      await tabLeaseManager.releaseSession(scope.sessionId);
    }
  }
  const trimmedName = (options?.name ?? '').trim();
  if (trimmedName) {
    mgr.sessionGroupTitles.set(scope?.sessionId ?? DEFAULT_SESSION_KEY, trimmedName);
    await mgr.saveToStorage();
  }

  const newTab = await chrome.tabs.create({
    url: 'chrome://newtab',
    active: options?.active ?? false
  });
  const newTabId = newTab?.id;
  if (!newTabId) throw new Error('Failed to create MCP tab');

  const group = await mgr.createGroup(newTabId, { origin: 'agent' });
  mgr.mcpTabGroupId = group.chromeGroupId;
  await saveMcpTabGroupId(mgr);
  await applyGroupTitle(group.chromeGroupId, resolveGroupTitle(mgr, scope?.sessionId));
  if (scope) {
    await tabLeaseManager.claimTab(scope.sessionId, newTabId, 'agent', {
      groupId: group.chromeGroupId
    });
  }

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
      if (
        group.color === chrome.tabGroups.Color.ORANGE &&
        group.title?.includes(TAB_GROUP_MARKER)
      ) {
        if ((await chrome.tabs.query({ groupId: group.id })).length > 0) return group.id;
      }
    return null;
  } catch {
    return null;
  }
}

export function resolveGroupTitle(mgr: TabGroupManager, sessionId?: string): string {
  const named = sessionId
    ? mgr.sessionGroupTitles.get(sessionId)
    : mgr.sessionGroupTitles.get(DEFAULT_SESSION_KEY);
  return named ? `${TAB_GROUP_MARKER} ${named}` : TAB_GROUP_TITLE;
}

export async function nameSession(
  mgr: TabGroupManager,
  sessionId: string,
  name: string
): Promise<{ title: string } | undefined> {
  const trimmed = name.trim();
  await mgr.initialize();
  if (trimmed) mgr.sessionGroupTitles.set(sessionId, trimmed);
  else mgr.sessionGroupTitles.delete(sessionId);
  await mgr.saveToStorage();
  const leases = await tabLeaseManager.getSessionActiveLeases(sessionId);
  if (leases.length === 0) return undefined;
  const groupId = await resolveLeaseGroupId(leases[0]);
  if (typeof groupId !== 'number') return undefined;
  await applyGroupTitle(groupId, resolveGroupTitle(mgr, sessionId));
  return { title: resolveGroupTitle(mgr, sessionId) };
}

export async function nameActiveMcpGroup(
  mgr: TabGroupManager,
  name: string
): Promise<{ title: string } | undefined> {
  const trimmed = name.trim();
  await mgr.initialize();
  await loadMcpTabGroupId(mgr);
  if (trimmed) mgr.sessionGroupTitles.set(DEFAULT_SESSION_KEY, trimmed);
  else mgr.sessionGroupTitles.delete(DEFAULT_SESSION_KEY);
  await mgr.saveToStorage();
  if (mgr.mcpTabGroupId === null) return undefined;
  try {
    await chrome.tabGroups.get(mgr.mcpTabGroupId);
  } catch {
    return undefined;
  }
  await applyGroupTitle(mgr.mcpTabGroupId, resolveGroupTitle(mgr));
  return { title: resolveGroupTitle(mgr) };
}

export async function applyGroupTitle(chromeGroupId: number, title: string): Promise<void> {
  try {
    await chrome.tabGroups.update(chromeGroupId, {
      title,
      color: chrome.tabGroups.Color.ORANGE
    });
  } catch {
    // ignore
  }
}

async function disposeSessionGroup(mgr: TabGroupManager, chromeGroupId: number): Promise<void> {
  try {
    const groupTabs = await chrome.tabs.query({ groupId: chromeGroupId });
    const tabIds = groupTabs.flatMap((tab) => (typeof tab.id === 'number' ? [tab.id] : []));
    if (tabIds.length > 0 && chrome.tabs.ungroup) {
      await chrome.tabs.ungroup(tabIds as [number, ...number[]]);
    }
  } catch {
    // group may already be gone
  }
  const meta = findMetadataByChromeGroupId(mgr, chromeGroupId);
  if (meta) await removeManagedGroupMetadata(mgr, meta);
  await mgr.saveToStorage();
}

async function getSessionMcpTabContext(
  mgr: TabGroupManager,
  scope: BrowserSessionScope,
  createIfEmpty: boolean,
  name?: string
): Promise<
  | {
      currentTabId: number;
      availableTabs: { id: number; title: string; url: string }[];
      tabCount: number;
      tabGroupId: number;
    }
  | undefined
> {
  const leases = await collectSessionLeases(scope.sessionId);
  const context = await buildSessionContextFromLeases(leases);
  if (context) {
    if (name?.trim()) {
      mgr.sessionGroupTitles.set(scope.sessionId, name.trim());
      await mgr.saveToStorage();
    }
    await ensureMcpGroupCharacteristics(mgr, context.tabGroupId, scope.sessionId);
    return context;
  }
  if (createIfEmpty) {
    return await createMcpTabGroup(mgr, {
      active: false,
      sessionId: scope.sessionId,
      name
    });
  }
}

async function resolveLeaseGroupId(lease: TabLease): Promise<number | undefined> {
  if (typeof lease.groupId === 'number') return lease.groupId;
  try {
    const tab = await chrome.tabs.get(lease.tabId);
    return tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE ? tab.groupId : undefined;
  } catch {
    return undefined;
  }
}

function getTabRuntimeInfo(tab: chrome.tabs.Tab): { domain?: string; url?: string } {
  const tabUrl = isInternalBrowserUrl(tab.url) ? undefined : tab.url;
  if (!tabUrl) return {};
  try {
    return { domain: new URL(tabUrl).hostname || undefined, url: tabUrl };
  } catch {
    return { url: tabUrl };
  }
}

function isInternalBrowserUrl(url: string | undefined): boolean {
  if (!url) return true;
  const internalPrefixes = ['chrome://', 'edge://', 'brave://', 'about:'];
  return internalPrefixes.some((prefix) => url.startsWith(prefix));
}
