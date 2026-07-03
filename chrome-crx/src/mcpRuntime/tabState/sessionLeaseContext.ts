// Shared helpers for turning a session's tab leases into a usable tab context.
// Used by both the MCP tab-group lookup (mcpTabGroup) and finalize
// (tabGroupFinalize) so the lease→context logic lives in exactly one place.

import { tabLeaseManager, type TabLease } from './tabLeases';
import type { FinalizedTabContext } from './types';

/**
 * Collect every lease currently owned by the session: prunes leases whose tabs
 * no longer exist, then merges still-active leases with handoff leases that
 * are resumed (flipped back to active) by this call.
 */
export async function collectSessionLeases(sessionId: string): Promise<TabLease[]> {
  await tabLeaseManager.pruneMissingTabs();
  const activeLeases = await tabLeaseManager.getSessionActiveLeases(sessionId);
  const resumedLeases = await tabLeaseManager.resumeHandoffTabs(sessionId);
  const byTab = new Map<number, TabLease>();
  for (const lease of [...activeLeases, ...resumedLeases]) {
    byTab.set(lease.tabId, lease);
  }
  return Array.from(byTab.values());
}

/**
 * Resolve the session's tab context from its leases. The primary handoff tab
 * (isActiveHandoff) is promoted to currentTabId so a resumed session continues
 * on the tab the agent was focused on, not whichever sorts first.
 */
export async function buildSessionContextFromLeases(
  leases: TabLease[]
): Promise<FinalizedTabContext | undefined> {
  const tabs: Array<chrome.tabs.Tab & { id: number }> = [];
  const results = await Promise.allSettled(leases.map((lease) => chrome.tabs.get(lease.tabId)));
  for (const result of results) {
    if (result.status === 'fulfilled' && typeof result.value.id === 'number') {
      tabs.push(result.value as chrome.tabs.Tab & { id: number });
    }
    // Stale lease: the lease manager prunes missing tabs on the next pass.
  }
  if (tabs.length === 0) return undefined;

  const leaseByTabId = new Map(leases.map((lease) => [lease.tabId, lease]));
  tabs.sort((a, b) => {
    const aLease = leaseByTabId.get(a.id);
    const bLease = leaseByTabId.get(b.id);
    if (aLease?.isActiveHandoff === true && bLease?.isActiveHandoff !== true) return -1;
    if (bLease?.isActiveHandoff === true && aLease?.isActiveHandoff !== true) return 1;
    if (a.windowId !== b.windowId) return a.windowId - b.windowId;
    return (a.index ?? 0) - (b.index ?? 0);
  });

  const firstLease = leaseByTabId.get(tabs[0].id);
  const tabGroupId =
    firstLease?.groupId ??
    (tabs[0].groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE ? tabs[0].groupId : undefined);
  if (typeof tabGroupId !== 'number') return undefined;

  return {
    currentTabId: tabs[0].id,
    availableTabs: tabs.map((tab) => ({
      id: tab.id,
      title: tab.title || '',
      url: tab.url || ''
    })),
    tabCount: tabs.length,
    tabGroupId
  };
}
