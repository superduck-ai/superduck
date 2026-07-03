import type { TabGroupManager } from './tabGroups';
import { findMetadataByChromeGroupId } from './mcpTabGroup';
import { getMemberOrigin } from './tabNavigationIsolation';
import { tabBadgeManager } from './tabBadges';
import { tabLeaseManager } from './tabLeases';
import { resolveBrowserSessionScope, type BrowserSessionScope } from '../sessionScope';
import { buildSessionContextFromLeases, collectSessionLeases } from './sessionLeaseContext';
import type {
  FinalizeMcpTabGroupOptions,
  FinalizeManagedGroupOptions,
  FinalizeTabStatus,
  FinalizeTabsKeep,
  FinalizedTabContext,
  GroupMetadata,
  MemberState
} from './types';

async function ungroupTabs(tabIds: number[]): Promise<void> {
  if (tabIds.length === 0 || !chrome.tabs.ungroup) return;
  await chrome.tabs.ungroup(tabIds as [number, ...number[]]);
}

function isFinalizeTabStatus(status: string): status is FinalizeTabStatus {
  return status === 'handoff' || status === 'deliverable';
}

/**
 * The ONLY place a managed group is decorated as completed (✅ prefix + GREEN
 * color). This is an explicit-completion signal — reached solely from
 * `tabs_finalize_mcp` when a handoff group is retained. Idle tool-context
 * cleanup must never get here: "no active tool for 20s" is the agent thinking,
 * not the task being done, so it stays ORANGE. Deliverable/release tabs leave
 * the group (they get a badge or are ungrouped), so there is nothing to color.
 */
export async function markGroupCompleted(
  mgr: TabGroupManager,
  chromeGroupId: number
): Promise<void> {
  const meta = findMetadataByChromeGroupId(mgr, chromeGroupId);
  if (!meta) return;
  await mgr.addCompletionPrefix(meta.mainTabId).catch(() => {});
  await mgr.setGroupColor(meta.mainTabId, chrome.tabGroups.Color.GREEN).catch(() => {});
}

export async function finalizeManagedGroup(
  mgr: TabGroupManager,
  options: FinalizeManagedGroupOptions = {}
): Promise<FinalizedTabContext | undefined> {
  await mgr.initialize();
  const meta = resolveManagedGroupMetadata(mgr, options);
  if (!meta) throw new Error('No managed tab group found to finalize');

  const groupTabs = await chrome.tabs.query({ groupId: meta.chromeGroupId });
  const tabIds = groupTabs.flatMap((tab) => (typeof tab.id === 'number' ? [tab.id] : []));
  const tabIdSet = new Set(tabIds);
  const keepByTabId = validateFinalizeKeep(options.keep ?? [], tabIdSet);
  const handoffTabIds: number[] = [];
  const deliverableTabIds: number[] = [];
  const releaseTabIds: number[] = [];

  for (const tabId of tabIds) {
    const status = keepByTabId.get(tabId);
    if (status === 'handoff') {
      handoffTabIds.push(tabId);
      continue;
    }
    if (status === 'deliverable') {
      deliverableTabIds.push(tabId);
      continue;
    }
    releaseTabIds.push(tabId);
  }

  await Promise.allSettled(tabIds.map((tabId) => hideAllIndicatorsForTab(mgr, tabId)));

  const metadataSnapshot =
    handoffTabIds.length > 0
      ? { mainTabId: meta.mainTabId, memberStates: new Map(meta.memberStates) }
      : undefined;

  try {
    if (handoffTabIds.length > 0) {
      keepOnlyHandoffTabs(mgr, meta, handoffTabIds);
    }

    const ungroupTabIds = [...deliverableTabIds, ...releaseTabIds];
    await ungroupTabs(ungroupTabIds);
  } catch (err) {
    if (metadataSnapshot) restoreManagedGroupMetadata(mgr, meta, metadataSnapshot);
    await reconcileManagedGroupMetadataWithChrome(mgr, meta).catch(() => {});
    await mgr.saveToStorage();
    throw err;
  }

  if (deliverableTabIds.length > 0) {
    await tabBadgeManager.markDeliverable(deliverableTabIds);
  }

  if (handoffTabIds.length === 0) {
    await removeManagedGroupMetadata(mgr, meta);
    await mgr.saveToStorage();
    return undefined;
  }

  await mgr.saveToStorage();
  await markGroupCompleted(mgr, meta.chromeGroupId);
  return await getFinalizedTabContext(meta.chromeGroupId);
}

export async function finalizeMcpTabGroup(
  mgr: TabGroupManager,
  options: FinalizeMcpTabGroupOptions = {}
): Promise<FinalizedTabContext | undefined> {
  const scope = resolveBrowserSessionScope({ sessionId: options.sessionId });
  if (scope) {
    return await finalizeSessionMcpTabGroup(mgr, scope, options.keep ?? []);
  }
  await mgr.initialize();
  await mgr.loadStoredMcpTabGroupId();
  if (mgr.mcpTabGroupId === null) return undefined;
  return await finalizeManagedGroup(mgr, {
    chromeGroupId: mgr.mcpTabGroupId,
    keep: options.keep
  });
}

async function finalizeSessionMcpTabGroup(
  mgr: TabGroupManager,
  scope: BrowserSessionScope,
  keep: FinalizeTabsKeep[]
): Promise<FinalizedTabContext | undefined> {
  await mgr.initialize();

  const leases = await collectSessionLeases(scope.sessionId);
  const context = await buildSessionContextFromLeases(leases);
  if (!context) return undefined;

  const activeTabIds = new Set(context.availableTabs.map((tab) => tab.id).filter(isNumber));
  const keepByTabId = validateFinalizeKeep(keep, activeTabIds);
  const handoffTabIds = Array.from(keepByTabId.entries())
    .filter(([, status]) => status === 'handoff')
    .map(([tabId]) => tabId);
  const deliverableTabIds = Array.from(keepByTabId.entries())
    .filter(([, status]) => status === 'deliverable')
    .map(([tabId]) => tabId);
  const handoffSet = new Set(handoffTabIds);
  const releaseTabIds = leases
    .map((lease) => lease.tabId)
    .filter((tabId) => activeTabIds.has(tabId) && !handoffSet.has(tabId));

  await Promise.allSettled(
    Array.from(activeTabIds).map((tabId) => hideAllIndicatorsForTab(mgr, tabId, true))
  );

  // releaseTabIds already excludes handoff tabs: release === leave the group.
  await ungroupTabs(releaseTabIds);

  if (handoffTabIds.length > 0) {
    await tabLeaseManager.handoffTabs(scope.sessionId, handoffTabIds, {
      groupId: context.tabGroupId,
      activeTabId: context.currentTabId
    });
  }
  if (releaseTabIds.length > 0) {
    await tabLeaseManager.releaseTabs(scope.sessionId, releaseTabIds);
  }
  if (deliverableTabIds.length > 0) {
    await tabBadgeManager.markDeliverable(deliverableTabIds);
  }

  const meta = findMetadataByChromeGroupId(mgr, context.tabGroupId);
  if (meta) {
    if (handoffTabIds.length > 0) {
      keepOnlyHandoffTabs(mgr, meta, handoffTabIds);
    } else {
      await removeManagedGroupMetadata(mgr, meta);
    }
    await mgr.saveToStorage();
  }

  if (handoffTabIds.length === 0) return undefined;
  await markGroupCompleted(mgr, context.tabGroupId);
  return await getFinalizedTabContext(context.tabGroupId);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

function resolveManagedGroupMetadata(
  mgr: TabGroupManager,
  options: FinalizeManagedGroupOptions
): GroupMetadata | undefined {
  if (typeof options.mainTabId === 'number') return mgr.groupMetadata.get(options.mainTabId);
  if (typeof options.chromeGroupId === 'number') {
    for (const meta of mgr.groupMetadata.values())
      if (meta.chromeGroupId === options.chromeGroupId) return meta;
  }
  if (mgr.mcpTabGroupId !== null) {
    for (const meta of mgr.groupMetadata.values())
      if (meta.chromeGroupId === mgr.mcpTabGroupId) return meta;
  }
  return undefined;
}

function validateFinalizeKeep(
  keep: FinalizeTabsKeep[],
  validTabIds: Set<number>
): Map<number, FinalizeTabStatus> {
  const keepByTabId = new Map<number, FinalizeTabStatus>();
  for (const entry of keep) {
    if (!Number.isInteger(entry.tabId)) {
      throw new Error('finalize keep entries require an integer tabId');
    }
    if (!validTabIds.has(entry.tabId)) {
      throw new Error(`finalize cannot keep unknown tab ${entry.tabId}`);
    }
    if (!isFinalizeTabStatus(entry.status)) {
      throw new Error(`finalize received invalid status ${String(entry.status)}`);
    }
    if (keepByTabId.has(entry.tabId)) {
      throw new Error(`finalize received duplicate tab ${entry.tabId}`);
    }
    keepByTabId.set(entry.tabId, entry.status);
  }
  return keepByTabId;
}

function keepOnlyHandoffTabs(
  mgr: TabGroupManager,
  meta: GroupMetadata,
  handoffTabIds: number[]
): void {
  const oldMainTabId = meta.mainTabId;
  const handoffSet = new Set(handoffTabIds);
  for (const memberTabId of Array.from(meta.memberStates.keys())) {
    if (!handoffSet.has(memberTabId)) meta.memberStates.delete(memberTabId);
  }
  for (const tabId of handoffTabIds) {
    const existing = meta.memberStates.get(tabId);
    meta.memberStates.set(tabId, {
      ...(existing ?? {}),
      indicatorState: 'none',
      origin: getMemberOrigin(existing),
      disposition: 'handoff'
    });
  }
  if (!handoffSet.has(meta.mainTabId)) {
    meta.mainTabId = handoffTabIds[0];
    mgr.groupMetadata.delete(oldMainTabId);
  }
  mgr.groupMetadata.set(meta.mainTabId, meta);
}

function restoreManagedGroupMetadata(
  mgr: TabGroupManager,
  meta: GroupMetadata,
  snapshot: { mainTabId: number; memberStates: Map<number, MemberState> }
): void {
  mgr.groupMetadata.delete(meta.mainTabId);
  mgr.groupMetadata.delete(snapshot.mainTabId);
  meta.mainTabId = snapshot.mainTabId;
  meta.memberStates = new Map(snapshot.memberStates);
  mgr.groupMetadata.set(snapshot.mainTabId, meta);
}

async function reconcileManagedGroupMetadataWithChrome(
  mgr: TabGroupManager,
  meta: GroupMetadata
): Promise<void> {
  const groupTabs = await chrome.tabs.query({ groupId: meta.chromeGroupId });
  const currentTabIds = new Set(
    groupTabs.flatMap((tab) => (typeof tab.id === 'number' ? [tab.id] : []))
  );
  if (currentTabIds.size === 0) {
    await removeManagedGroupMetadata(mgr, meta);
    return;
  }

  for (const memberTabId of Array.from(meta.memberStates.keys())) {
    if (!currentTabIds.has(memberTabId)) meta.memberStates.delete(memberTabId);
  }
  for (const tabId of currentTabIds) {
    if (!meta.memberStates.has(tabId)) {
      meta.memberStates.set(tabId, {
        indicatorState: tabId === meta.mainTabId ? 'none' : 'static',
        origin: 'user',
        disposition: 'active'
      });
    }
  }
  if (!currentTabIds.has(meta.mainTabId)) {
    const oldMainTabId = meta.mainTabId;
    meta.mainTabId = groupTabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
      .sort((a, b) => {
        if (a.windowId !== b.windowId) return a.windowId - b.windowId;
        return (a.index ?? 0) - (b.index ?? 0);
      })[0].id;
    mgr.groupMetadata.delete(oldMainTabId);
  }
  mgr.groupMetadata.set(meta.mainTabId, meta);
}

async function getFinalizedTabContext(
  chromeGroupId: number
): Promise<FinalizedTabContext | undefined> {
  const tabs = (await chrome.tabs.query({ groupId: chromeGroupId })).flatMap((tab) =>
    typeof tab.id === 'number' ? [{ id: tab.id, title: tab.title || '', url: tab.url || '' }] : []
  );
  if (tabs.length === 0) return undefined;
  return {
    currentTabId: tabs[0].id,
    availableTabs: tabs,
    tabCount: tabs.length,
    tabGroupId: chromeGroupId
  };
}

async function hideAllIndicatorsForTab(
  mgr: TabGroupManager,
  tabId: number,
  isMcp?: boolean
): Promise<void> {
  await Promise.allSettled([
    mgr.sendIndicatorMessage(tabId, 'HIDE_AGENT_INDICATORS', isMcp),
    mgr.sendIndicatorMessage(tabId, 'HIDE_STATIC_INDICATOR', isMcp)
  ]);
}

export async function removeManagedGroupMetadata(
  mgr: TabGroupManager,
  meta: {
    mainTabId: number;
    chromeGroupId: number;
  }
): Promise<void> {
  mgr.groupMetadata.delete(meta.mainTabId);
  mgr.groupBlocklistStatuses.delete(meta.chromeGroupId);
  if (await mgr.isCurrentMcpChromeGroup(meta.chromeGroupId)) {
    await mgr.clearMcpTabGroup().catch(() => {});
  }
}
