import type { TabGroupManager } from './tabGroups';
import { TAB_GROUP_TITLE } from './types';
import { removeManagedGroupMetadata } from './tabGroupFinalize';

export function scheduleRegroupRetry(mgr: TabGroupManager, tabId: number): void {
  const pending = mgr.pendingRegroups.get(tabId);
  pending &&
    (pending.timeoutId && clearTimeout(pending.timeoutId),
    (pending.timeoutId = setTimeout(() => {
      attemptRegroup(mgr, tabId);
    }, 1000)));
}

export async function attemptRegroup(mgr: TabGroupManager, tabId: number): Promise<void> {
  const pending = mgr.pendingRegroups.get(tabId);
  if (pending) {
    pending.attemptCount++;
    try {
      if ((await chrome.tabs.get(tabId)).groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE)
        return void mgr.pendingRegroups.delete(tabId);
      const newGroupId = await chrome.tabs.group({ tabIds: [tabId] });
      if (
        (await chrome.tabGroups.update(newGroupId, {
          title: TAB_GROUP_TITLE,
          color: chrome.tabGroups.Color.ORANGE,
          collapsed: false
        }),
        (pending.metadata.chromeGroupId = newGroupId),
        pending.metadata.memberStates.clear(),
        pending.metadata.memberStates.set(tabId, {
          indicatorState: pending.indicatorState,
          origin: pending.origin,
          disposition: pending.disposition
        }),
        await mgr.updateMcpTabGroupIdAfterRegroup(pending.originalGroupId, newGroupId),
        pending.originalGroupId !== newGroupId &&
          mgr.groupBlocklistStatuses.delete(pending.originalGroupId),
        'pulsing' === pending.indicatorState)
      )
        try {
          await mgr.sendIndicatorMessage(tabId, 'SHOW_AGENT_INDICATORS');
        } catch (err) {
          // ignore
        }
      mgr.groupMetadata.set(tabId, pending.metadata);
      await mgr.saveToStorage();
      await mgr.cleanupOldGroup(pending.originalGroupId, tabId);
      mgr.pendingRegroups.delete(tabId);
      mgr.processingMainTabRemoval.delete(tabId);
    } catch {
      if (pending.attemptCount < 5) scheduleRegroupRetry(mgr, tabId);
      else {
        try {
          const newGroupId = await chrome.tabs.group({ tabIds: [tabId] });
          if (
            (await chrome.tabGroups.update(newGroupId, {
              title: TAB_GROUP_TITLE,
              color: chrome.tabGroups.Color.ORANGE,
              collapsed: false
            }),
            (pending.metadata.chromeGroupId = newGroupId),
            pending.metadata.memberStates.clear(),
            pending.metadata.memberStates.set(tabId, {
              indicatorState: pending.indicatorState,
              origin: pending.origin,
              disposition: pending.disposition
            }),
            await mgr.updateMcpTabGroupIdAfterRegroup(pending.originalGroupId, newGroupId),
            pending.originalGroupId !== newGroupId &&
              mgr.groupBlocklistStatuses.delete(pending.originalGroupId),
            'pulsing' === pending.indicatorState)
          )
            try {
              await mgr.sendIndicatorMessage(tabId, 'SHOW_AGENT_INDICATORS');
            } catch (err) {
              // ignore
            }
          mgr.groupMetadata.set(tabId, pending.metadata);
          await mgr.saveToStorage();
          await mgr.cleanupOldGroup(pending.originalGroupId, tabId);
        } catch (err) {
          await removeManagedGroupMetadata(mgr, {
            mainTabId: tabId,
            chromeGroupId: pending.originalGroupId
          });
          await mgr.saveToStorage();
        }
        mgr.pendingRegroups.delete(tabId);
        mgr.processingMainTabRemoval.delete(tabId);
      }
    }
  }
}
