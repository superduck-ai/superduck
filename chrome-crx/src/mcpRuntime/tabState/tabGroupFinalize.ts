import type { TabGroupManager } from './tabGroups';
import { getMemberOrigin } from './tabNavigationIsolation';
import type {
  FinalizeManagedGroupOptions,
  FinalizeTabStatus,
  FinalizeTabsKeep,
  FinalizedTabContext,
  GroupMetadata,
  MemberState
} from './types';

function isFinalizeTabStatus(status: string): status is FinalizeTabStatus {
  return status === 'handoff' || status === 'deliverable';
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
  const closeTabIds: number[] = [];
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
    const memberState = meta.memberStates.get(tabId);
    if (getMemberOrigin(memberState) === 'agent') {
      closeTabIds.push(tabId);
    } else {
      releaseTabIds.push(tabId);
    }
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

    if (closeTabIds.length > 0) {
      await chrome.tabs.remove(closeTabIds);
    }

    const ungroupTabIds = [...deliverableTabIds, ...releaseTabIds];
    if (ungroupTabIds.length > 0 && chrome.tabs.ungroup) {
      await chrome.tabs.ungroup(ungroupTabIds as [number, ...number[]]);
    }
  } catch (err) {
    if (metadataSnapshot) restoreManagedGroupMetadata(mgr, meta, metadataSnapshot);
    await reconcileManagedGroupMetadataWithChrome(mgr, meta).catch(() => {});
    await mgr.saveToStorage();
    throw err;
  }

  if (handoffTabIds.length === 0) {
    await removeManagedGroupMetadata(mgr, meta);
    await mgr.saveToStorage();
    return undefined;
  }

  await mgr.saveToStorage();
  return await getFinalizedTabContext(meta.chromeGroupId);
}

export async function finalizeMcpTabGroup(
  mgr: TabGroupManager,
  options: { keep?: FinalizeTabsKeep[] } = {}
): Promise<FinalizedTabContext | undefined> {
  await mgr.initialize();
  await mgr.loadStoredMcpTabGroupId();
  if (mgr.mcpTabGroupId === null) return undefined;
  return await finalizeManagedGroup(mgr, {
    chromeGroupId: mgr.mcpTabGroupId,
    keep: options.keep
  });
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
