import type { TabGroupManager } from './tabGroups';
import { getTabEventManager } from './tabEvents';
import { TAB_GROUP_TITLE } from './types';
import { getMemberOrigin } from './tabNavigationIsolation';
import { removeManagedGroupMetadata } from './tabGroupFinalize';

export async function handleTabGroupChange(
  mgr: TabGroupManager,
  tabId: number,
  newGroupId: number
): Promise<void> {
  for (const [mainTabId, meta] of mgr.groupMetadata.entries())
    if (meta.memberStates.has(tabId)) {
      if (newGroupId === chrome.tabGroups.TAB_GROUP_ID_NONE || newGroupId !== meta.chromeGroupId) {
        const memberState = meta.memberStates.get(tabId);
        const indicatorState = memberState?.indicatorState || 'none';
        try {
          let msgType = 'HIDE_AGENT_INDICATORS';
          'static' === indicatorState && (msgType = 'HIDE_STATIC_INDICATOR');
          await mgr.sendIndicatorMessage(tabId, msgType);
        } catch (err) {
          // ignore
        }
        if ((meta.memberStates.delete(tabId), tabId === mainTabId)) {
          if (mgr.processingMainTabRemoval.has(mainTabId)) return;
          if (mgr.pendingRegroups.has(mainTabId)) return;
          mgr.processingMainTabRemoval.add(mainTabId);
          const mainIndicatorState = indicatorState;
          const mainOrigin = getMemberOrigin(memberState);
          const mainDisposition = memberState?.disposition ?? 'active';
          const oldChromeGroupId = meta.chromeGroupId;

          if (newGroupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
            try {
              await mgr.sendIndicatorMessage(mainTabId, 'HIDE_AGENT_INDICATORS');
            } catch (err) {
              // ignore
            }
            for (const [memberTabId, memberState] of meta.memberStates.entries()) {
              if (memberTabId === mainTabId) continue;
              const indicator = memberState.indicatorState;
              const hideType =
                indicator === 'static' ? 'HIDE_STATIC_INDICATOR' : 'HIDE_AGENT_INDICATORS';
              try {
                await mgr.sendIndicatorMessage(memberTabId, hideType, memberState.isMcp);
              } catch (err) {
                // ignore — tab may already be closed
              }
            }
            await removeManagedGroupMetadata(mgr, {
              mainTabId,
              chromeGroupId: oldChromeGroupId
            });
            mgr.processingMainTabRemoval.delete(mainTabId);
            await mgr.saveToStorage();
            return;
          }

          try {
            const newChromeGroupId = await chrome.tabs.group({
              tabIds: [mainTabId]
            });
            if (
              (await chrome.tabGroups.update(newChromeGroupId, {
                title: TAB_GROUP_TITLE,
                color: chrome.tabGroups.Color.ORANGE,
                collapsed: false
              }),
              (meta.chromeGroupId = newChromeGroupId),
              meta.memberStates.clear(),
              meta.memberStates.set(mainTabId, {
                indicatorState: mainIndicatorState,
                origin: mainOrigin,
                disposition: mainDisposition
              }),
              await mgr.updateMcpTabGroupIdAfterRegroup(oldChromeGroupId, newChromeGroupId),
              oldChromeGroupId !== newChromeGroupId &&
                mgr.groupBlocklistStatuses.delete(oldChromeGroupId),
              'pulsing' === mainIndicatorState)
            )
              try {
                await mgr.sendIndicatorMessage(mainTabId, 'SHOW_AGENT_INDICATORS');
              } catch (err) {
                // ignore
              }
            return (
              mgr.groupMetadata.set(mainTabId, meta),
              await mgr.saveToStorage(),
              await mgr.cleanupOldGroup(oldChromeGroupId, mainTabId),
              void mgr.processingMainTabRemoval.delete(mainTabId)
            );
          } catch (err) {
            return err instanceof Error && err.message && err.message.includes('dragging')
              ? (mgr.pendingRegroups.set(mainTabId, {
                  tabId: mainTabId,
                  originalGroupId: oldChromeGroupId,
                  indicatorState: mainIndicatorState,
                  origin: mainOrigin,
                  disposition: mainDisposition,
                  metadata: meta,
                  attemptCount: 0
                }),
                void mgr.scheduleRegroupRetry(mainTabId))
              : (await removeManagedGroupMetadata(mgr, {
                  mainTabId,
                  chromeGroupId: oldChromeGroupId
                }),
                await mgr.saveToStorage(),
                void mgr.processingMainTabRemoval.delete(mainTabId));
          }
        }
        await mgr.saveToStorage();
        break;
      }
    }
  if (newGroupId && newGroupId !== chrome.tabGroups.TAB_GROUP_ID_NONE)
    for (const [mainTabId, meta] of mgr.groupMetadata.entries())
      if (meta.chromeGroupId === newGroupId) {
        if (!meta.memberStates.has(tabId)) {
          const isSecondary = tabId !== mainTabId;
          meta.memberStates.set(tabId, {
            indicatorState: isSecondary ? 'static' : 'none',
            origin: 'user',
            disposition: 'active'
          });
          try {
            const tab = await chrome.tabs.get(tabId);
            tab.url && (await mgr.updateTabBlocklistStatus(tabId, tab.url));
          } catch (err) {
            // ignore
          }
          const isDismissed = await mgr.isGroupDismissed(meta.chromeGroupId);
          if (isSecondary && !isDismissed) {
            let retryCount = 0;
            const maxRetries = 3;
            const retryDelay = 500;
            const tryShowIndicator = async (): Promise<boolean> => {
              try {
                return (await mgr.sendIndicatorMessage(tabId, 'SHOW_STATIC_INDICATOR'), true);
              } catch (err) {
                return (
                  retryCount++,
                  retryCount < maxRetries && setTimeout(tryShowIndicator, retryDelay),
                  false
                );
              }
            };
            await tryShowIndicator();
          }
          await mgr.saveToStorage();
        }
        break;
      }
}

export async function reconcileWithChrome(mgr: TabGroupManager): Promise<void> {
  const allTabs = await chrome.tabs.query({});
  const activeGroupIds = new Set<number>();
  for (const tab of allTabs)
    tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE && activeGroupIds.add(tab.groupId);
  const toRemove: number[] = [];
  let changed = false;
  for (const [mainTabId, meta] of mgr.groupMetadata.entries())
    try {
      const tab = await chrome.tabs.get(mainTabId);
      if (activeGroupIds.has(meta.chromeGroupId))
        if (tab.groupId !== meta.chromeGroupId) toRemove.push(mainTabId);
        else {
          const groupTabs = await chrome.tabs.query({
            groupId: meta.chromeGroupId
          });
          const currentTabIds = new Set(groupTabs.map((t) => t.id).filter((id) => void 0 !== id));
          const staleMembers: number[] = [];
          for (const [memberId] of meta.memberStates)
            currentTabIds.has(memberId) || staleMembers.push(memberId);
          if (staleMembers.length > 0) {
            for (const id of staleMembers) {
              meta.memberStates.delete(id);
              try {
                await mgr.sendIndicatorMessage(id, 'HIDE_AGENT_INDICATORS');
              } catch {
                // ignore
              }
            }
            changed = true;
          }
        }
      else toRemove.push(mainTabId);
    } catch {
      toRemove.push(mainTabId);
    }
  for (const id of toRemove) {
    const meta = mgr.groupMetadata.get(id);
    if (meta) await removeManagedGroupMetadata(mgr, meta);
  }
  (toRemove.length > 0 || changed) && (await mgr.saveToStorage());
}

export function startTabGroupChangeListener(mgr: TabGroupManager): void {
  if (mgr.isTabGroupListenerStarted) return;
  const eventManager = getTabEventManager();
  mgr.tabGroupListenerSubscriptionId = eventManager.subscribe(
    'all',
    ['groupId'],
    async (tabId: number, changeInfo: { groupId?: number }) => {
      if (typeof changeInfo.groupId === 'number') {
        await handleTabGroupChange(mgr, tabId, changeInfo.groupId);
      }
    }
  );
  mgr.isTabGroupListenerStarted = true;
}

export function stopTabGroupChangeListener(mgr: TabGroupManager): void {
  if (!mgr.isTabGroupListenerStarted || !mgr.tabGroupListenerSubscriptionId) return;
  getTabEventManager().unsubscribe(mgr.tabGroupListenerSubscriptionId);
  mgr.tabGroupListenerSubscriptionId = null;
  mgr.isTabGroupListenerStarted = false;
}
