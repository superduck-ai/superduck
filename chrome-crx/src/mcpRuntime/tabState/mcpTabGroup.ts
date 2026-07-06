import type { TabGroupManager } from './tabGroups';
import { StorageKeys } from '../../extensionServices';
import type { GroupMetadata } from './types';
import {
  BrowserSessionConflictError,
  tabLeaseManager,
  type TabLease,
  type TabLeaseOrigin
} from './tabLeases';
import {
  DEFAULT_BROWSER_SESSION_ID,
  resolveBrowserSessionScope,
  type BrowserSessionScope
} from '../sessionScope';
import { buildSessionContextFromLeases, collectSessionLeases } from './sessionLeaseContext';
import { removeManagedGroupMetadata } from './tabGroupFinalize';
import {
  decorateGroupTitleForStatus,
  resolveBaseGroupTitle,
  resolveGroupDisplayColor,
  resolveGroupDisplayTitle
} from './tabGroupAppearance';

async function selectAvailableTabForScope(
  tabs: (chrome.tabs.Tab & { id: number })[],
  scope: BrowserSessionScope
): Promise<(chrome.tabs.Tab & { id: number }) | undefined> {
  let firstConflict: BrowserSessionConflictError | undefined;
  for (const tab of tabs) {
    try {
      await tabLeaseManager.assertTabAvailableForSession(scope.sessionId, tab.id);
      return tab;
    } catch (err) {
      if (err instanceof BrowserSessionConflictError) {
        firstConflict ??= err;
        continue;
      }
      throw err;
    }
  }
  if (firstConflict) throw firstConflict;
  return undefined;
}

function resolveMcpScope(options?: { sessionId?: string }): BrowserSessionScope {
  return resolveBrowserSessionScope(options) ?? { sessionId: DEFAULT_BROWSER_SESSION_ID };
}

// CLI/MCP 调用来源：native-messaging(CLI 经 native-host)与 bridge(MCP WebSocket)。
// 这类来源是闭环自动化,操作必须在 session 的 MCP group 内;sidepanel 无 source
// 走原逻辑(允许协助操作用户已有的任意 tab)。
function isCliMcpSource(source: string | undefined): boolean {
  return source === 'bridge' || source === 'native-messaging';
}

async function resolveManagedChromeGroupId(
  mgr: TabGroupManager,
  chromeGroupId: number | undefined,
  group: Awaited<ReturnType<TabGroupManager['findGroupByTab']>>
): Promise<number | undefined> {
  if (typeof group?.chromeGroupId === 'number' && !group.isUnmanaged) return group.chromeGroupId;
  if (typeof chromeGroupId !== 'number') return undefined;
  if (await isStoredMcpChromeGroup(mgr, chromeGroupId)) return chromeGroupId;
  return undefined;
}

async function markManagedGroupActiveForSession(
  mgr: TabGroupManager,
  chromeGroupId: number,
  sessionId: string
): Promise<void> {
  const meta = findMetadataByChromeGroupId(mgr, chromeGroupId);
  if (!meta) return;
  const shouldBindSession =
    meta.sessionId !== undefined || sessionId !== DEFAULT_BROWSER_SESSION_ID;
  const changed = (shouldBindSession && meta.sessionId !== sessionId) || meta.status !== 'active';
  if (shouldBindSession) meta.sessionId = sessionId;
  meta.status = 'active';
  if (changed) await mgr.saveToStorage();
  await applyGroupTitle(
    chromeGroupId,
    resolveBaseGroupTitle(mgr, shouldBindSession ? sessionId : undefined, meta.title),
    'active'
  );
}

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
  options: { sessionId?: string; claimUnleased?: boolean; source?: string } = {}
): Promise<{ tabId: number | undefined; domain?: string; url?: string }> {
  const scope = resolveMcpScope(options);
  const claimUnleased = options.claimUnleased !== false;
  await mgr.initialize();
  await migrateLegacyMcpTabGroupToDefaultSession(mgr);

  if (void 0 !== tabId)
    try {
      const tab = await chrome.tabs.get(tabId);
      const group = await mgr.findGroupByTab(tabId);
      const chromeGroupId =
        tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE ? tab.groupId : undefined;
      const managedGroupId = await resolveManagedChromeGroupId(mgr, chromeGroupId, group);
      const existingLease = await tabLeaseManager.getLease(tabId);
      if (existingLease && existingLease.sessionId !== scope.sessionId) {
        throw new BrowserSessionConflictError(tabId, existingLease.sessionId);
      }
      if (isCliMcpSource(options.source) && typeof managedGroupId !== 'number') {
        // CLI/MCP 闭环:散落 tab(不在受管 group)操作前先纳入当前 session 的 MCP group,
        // 避免操作落在 group 外(典型场景:finalize 后用旧 tab id 继续 turn)。
        const existing = await getSessionMcpTabContext(mgr, scope, false);
        let groupId: number;
        if (existing) {
          const meta = findMetadataByChromeGroupId(mgr, existing.tabGroupId);
          await mgr.addTabToGroup(meta?.mainTabId ?? existing.currentTabId, tabId, {
            origin: 'agent',
            sessionId: scope.sessionId
          });
          // addTabToGroup 吞掉除 BrowserSessionConflictError 外的错误
          // (tabGroupLifecycle.ts:120 的外层 catch // ignore), 这里必须校验 tab 真的进了
          // group, 否则归组失败仍会落到"裸操作散落 tab"的原问题。
          const relocated = await chrome.tabs.get(tabId);
          if (
            relocated.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE ||
            relocated.groupId !== existing.tabGroupId
          ) {
            throw new Error(
              `Failed to regroup tab ${tabId} into session group ${existing.tabGroupId}`
            );
          }
          groupId = existing.tabGroupId;
        } else {
          // session 无 group:用散落 tab 本身作种子建新 group,不另开空白 newtab。
          const created = await mgr.createGroup(tabId, { origin: 'agent' });
          created.sessionId = scope.sessionId;
          created.status = 'active';
          const createdMeta = mgr.groupMetadata.get(created.mainTabId);
          if (createdMeta) {
            createdMeta.sessionId = scope.sessionId;
            createdMeta.status = 'active';
            await mgr.saveToStorage();
          }
          await applyGroupTitle(
            created.chromeGroupId,
            resolveGroupTitle(mgr, scope.sessionId),
            'active'
          );
          await tabLeaseManager.claimTab(scope.sessionId, tabId, 'agent', {
            groupId: created.chromeGroupId
          });
          groupId = created.chromeGroupId;
        }
        if (claimUnleased) {
          await markManagedGroupActiveForSession(mgr, groupId, scope.sessionId);
        }
        return { tabId, ...getTabRuntimeInfo(tab) };
      }
      const memberOrigin = group?.memberStates.get(tabId)?.origin;
      const shouldClaimUnleased = claimUnleased && !existingLease;
      if (typeof managedGroupId === 'number') {
        await ensureMcpGroupCharacteristics(mgr, managedGroupId, scope.sessionId);
      }
      if (existingLease && claimUnleased) {
        await tabLeaseManager.claimTab(scope.sessionId, tabId, existingLease.origin, {
          groupId: managedGroupId
        });
      } else if (shouldClaimUnleased) {
        await tabLeaseManager.claimTab(
          scope.sessionId,
          tabId,
          (memberOrigin ?? 'user') as TabLeaseOrigin,
          { groupId: managedGroupId }
        );
      }
      if (claimUnleased && typeof managedGroupId === 'number') {
        await markManagedGroupActiveForSession(mgr, managedGroupId, scope.sessionId);
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
        const tab = await selectAvailableTabForScope(tabs, scope);
        if (tab) return await getTabForMcp(mgr, tab.id, undefined, options);
      }
    } catch (err) {
      if (err instanceof BrowserSessionConflictError) throw err;
    }
    throw new Error(`Could not find tab group ${tabGroupId}`);
  }

  const context = await getSessionMcpTabContext(mgr, scope, false);
  if (context) {
    const tab = await chrome.tabs.get(context.currentTabId);
    return { tabId: context.currentTabId, ...getTabRuntimeInfo(tab) };
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
  const lease = await tabLeaseManager.getLease(tabId);
  return Boolean(lease);
}

export async function ensureMcpGroupCharacteristics(
  mgr: TabGroupManager,
  chromeGroupId: number,
  sessionId?: string
): Promise<void> {
  try {
    const group = await chrome.tabGroups.get(chromeGroupId);
    const meta = findMetadataByChromeGroupId(mgr, chromeGroupId);
    const shouldUsePassedSession =
      sessionId !== undefined &&
      (meta?.sessionId !== undefined || sessionId !== DEFAULT_BROWSER_SESSION_ID);
    const metadataSessionId = meta?.sessionId ?? (shouldUsePassedSession ? sessionId : undefined);
    const desiredTitle = resolveGroupDisplayTitle(
      mgr,
      metadataSessionId,
      meta?.status,
      meta?.title
    );
    const desiredColor = resolveGroupDisplayColor(meta?.status);
    const titleOk = group.title === desiredTitle;
    const colorOk = group.color === desiredColor;
    if (titleOk && colorOk) return;
    await chrome.tabGroups.update(chromeGroupId, {
      ...(titleOk ? {} : { title: desiredTitle }),
      ...(colorOk ? {} : { color: desiredColor })
    });
  } catch {
    // ignore
  }
}

export async function clearMcpTabGroup(mgr: TabGroupManager): Promise<void> {
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
  const scope = resolveMcpScope(options);
  await migrateLegacyMcpTabGroupToDefaultSession(mgr);
  return await getSessionMcpTabContext(mgr, scope, createIfEmpty, name);
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
  const scope = resolveMcpScope(options);
  const existing = await getSessionMcpTabContext(mgr, scope, false);
  if (existing && options?.replaceExisting !== true) {
    throw new Error(
      `Session already has MCP tab group ${existing.tabGroupId}; use tab_group list --create-if-empty to reuse tab ${existing.currentTabId}, or pass --force to discard active/handoff tabs and replace it.`
    );
  }
  if (options?.replaceExisting === true) {
    if (existing) {
      await disposeSessionGroup(mgr, existing.tabGroupId);
    }
    await tabLeaseManager.releaseSession(scope.sessionId);
  }
  const trimmedName = (options?.name ?? '').trim();
  if (trimmedName) {
    mgr.sessionGroupTitles.set(scope.sessionId, trimmedName);
    await mgr.saveToStorage();
  }

  const newTab = await chrome.tabs.create({
    url: 'chrome://newtab',
    active: options?.active ?? false
  });
  const newTabId = newTab?.id;
  if (!newTabId) throw new Error('Failed to create MCP tab');

  const group = await mgr.createGroup(newTabId, { origin: 'agent' });
  group.sessionId = scope.sessionId;
  group.status = 'active';
  const meta = mgr.groupMetadata.get(group.mainTabId);
  if (meta) {
    meta.sessionId = scope.sessionId;
    meta.status = 'active';
    await mgr.saveToStorage();
  }
  await applyGroupTitle(group.chromeGroupId, resolveGroupTitle(mgr, scope.sessionId), 'active');
  await tabLeaseManager.claimTab(scope.sessionId, newTabId, 'agent', {
    groupId: group.chromeGroupId
  });

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

export async function loadStoredMcpTabGroupId(mgr: TabGroupManager): Promise<void> {
  await migrateLegacyMcpTabGroupToDefaultSession(mgr);
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
  return await isStoredMcpChromeGroup(mgr, chromeGroupId);
}

export async function updateMcpTabGroupIdAfterRegroup(
  mgr: TabGroupManager,
  oldChromeGroupId: number,
  _newChromeGroupId: number
): Promise<void> {
  if (await isStoredMcpChromeGroup(mgr, oldChromeGroupId)) {
    await clearMcpTabGroup(mgr);
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

export function resolveGroupTitle(mgr: TabGroupManager, sessionId?: string): string {
  return resolveBaseGroupTitle(mgr, sessionId ?? DEFAULT_BROWSER_SESSION_ID);
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
  return await nameSession(mgr, DEFAULT_BROWSER_SESSION_ID, name);
}

export async function applyGroupTitle(
  chromeGroupId: number,
  title: string,
  status: GroupMetadata['status'] = 'active'
): Promise<void> {
  try {
    await chrome.tabGroups.update(chromeGroupId, {
      title: decorateGroupTitleForStatus(title, status),
      color: resolveGroupDisplayColor(status)
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
  await migrateLegacyMcpTabGroupToDefaultSession(mgr);
  const leases = await collectSessionLeases(scope.sessionId);
  const context = await buildSessionContextFromLeases(leases);
  if (context) {
    if (name?.trim()) {
      mgr.sessionGroupTitles.set(scope.sessionId, name.trim());
      await mgr.saveToStorage();
    }
    const meta = findMetadataByChromeGroupId(mgr, context.tabGroupId);
    if (meta) {
      meta.sessionId = scope.sessionId;
      meta.status = 'active';
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

async function migrateLegacyMcpTabGroupToDefaultSession(mgr: TabGroupManager): Promise<void> {
  const storedData = await chrome.storage.local.get([
    mgr.MCP_TAB_GROUP_KEY,
    mgr.MCP_TAB_GROUP_OWNER_KEY
  ] as string[]);
  const stored = storedData[mgr.MCP_TAB_GROUP_KEY];
  const owner = storedData[mgr.MCP_TAB_GROUP_OWNER_KEY];
  if (typeof stored !== 'number') return;
  if (owner !== stored) {
    await clearMcpTabGroup(mgr);
    return;
  }

  try {
    await chrome.tabGroups.get(stored);
    const tabs = (await chrome.tabs.query({ groupId: stored }))
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
      .sort((a, b) => {
        if (a.windowId !== b.windowId) return a.windowId - b.windowId;
        return (a.index ?? 0) - (b.index ?? 0);
      });
    if (tabs.length === 0) {
      await clearMcpTabGroup(mgr);
      return;
    }

    let meta = findMetadataByChromeGroupId(mgr, stored);
    if (!meta) {
      const firstTab = tabs[0];
      const domain = tabDomain(firstTab);
      meta = {
        mainTabId: firstTab.id,
        createdAt: Date.now(),
        domain,
        chromeGroupId: stored,
        sessionId: DEFAULT_BROWSER_SESSION_ID,
        status: 'active',
        memberStates: new Map()
      };
      mgr.groupMetadata.set(firstTab.id, meta);
    }
    migrateLegacyStoredMcpGroup(meta);
    meta.sessionId = DEFAULT_BROWSER_SESSION_ID;
    meta.status = meta.status ?? 'active';
    for (const tab of tabs) {
      const existingState = meta.memberStates.get(tab.id);
      meta.memberStates.set(tab.id, {
        ...(existingState ?? {}),
        indicatorState:
          existingState?.indicatorState ?? (tab.id === meta.mainTabId ? 'none' : 'static'),
        origin: (existingState?.origin ?? 'agent') as TabLeaseOrigin,
        disposition: existingState?.disposition ?? 'active'
      });
      await tabLeaseManager.claimTab(DEFAULT_BROWSER_SESSION_ID, tab.id, 'agent', {
        groupId: stored
      });
    }
    await mgr.saveToStorage();
    await ensureMcpGroupCharacteristics(mgr, stored, DEFAULT_BROWSER_SESSION_ID);
    await clearMcpTabGroup(mgr);
  } catch {
    await clearMcpTabGroup(mgr).catch(() => {});
  }
}

function tabDomain(tab: chrome.tabs.Tab): string {
  if (!tab.url) return 'blank';
  try {
    return new URL(tab.url).hostname || 'blank';
  } catch {
    return 'blank';
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
