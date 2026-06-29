import { useCallback } from 'react';
import { categoryChecker, migrateGroupFinalizationState, tabGroupManager } from '../../mcpRuntime';
import type { BlockedTabInfo } from '../types';

export interface UseTabGroupActionsProps {
  queryTabId: number | undefined;
  setBlockedCategory: (category: string | null) => void;
  setBlockedTabInfo: (info: { isMainTabBlocked: boolean; blockedTabs: BlockedTabInfo[] }) => void;
  panelReadyPromiseRef: React.MutableRefObject<Promise<unknown> | null>;
}

/**
 * useTabGroupActions — Tab group 操作
 * 处理 tab group 相关操作：确保主 tab 正确、刷新阻止状态
 */
export function useTabGroupActions({
  queryTabId,
  setBlockedCategory,
  setBlockedTabInfo,
  panelReadyPromiseRef
}: UseTabGroupActionsProps) {
  const ensureCurrentTabIsMainInGroup = useCallback(async () => {
    if (typeof queryTabId !== 'number') return;
    try {
      await panelReadyPromiseRef.current;
      await tabGroupManager.initialize(true);
      const group = await tabGroupManager.findGroupByTab(queryTabId);
      if (!group) return;

      if (group.isUnmanaged) {
        return;
      }

      if (group.mainTabId !== queryTabId) {
        try {
          await tabGroupManager.promoteToMainTab(group.mainTabId, queryTabId);
          migrateGroupFinalizationState(group.mainTabId, queryTabId);
          await tabGroupManager.initialize(true);
        } catch {
          // The service worker may have already promoted the tab, or the
          // group may have changed while the sidepanel was opening.
        }
      }
    } catch {
      // A tab-group sync failure should not block the sidepanel UI.
    }
  }, [queryTabId, panelReadyPromiseRef]);

  const refreshBlockedState = useCallback(async () => {
    if (typeof queryTabId !== 'number') return;
    try {
      await tabGroupManager.initialize();
      const tab = await chrome.tabs.get(queryTabId);
      const inGroup = await tabGroupManager.isInGroup(queryTabId);
      const isMain = tabGroupManager.isMainTab(queryTabId);
      if (inGroup) {
        const mainTabId = isMain
          ? queryTabId
          : (await tabGroupManager.getMainTabId(queryTabId)) || queryTabId;
        const category = await tabGroupManager.getGroupBlocklistStatus(mainTabId);
        const info = (await tabGroupManager.getBlockedTabsInfo(mainTabId)) as {
          isMainTabBlocked: boolean;
          blockedTabs: BlockedTabInfo[];
        };
        setBlockedCategory(category || null);
        setBlockedTabInfo(info);
      } else if (tab.url) {
        if (tab.url.includes('blocked.html')) {
          setBlockedCategory('category1');
          setBlockedTabInfo({
            isMainTabBlocked: true,
            blockedTabs: [
              {
                tabId: queryTabId,
                title: tab.title || 'Untitled',
                url: tab.url || '',
                category: 'category1'
              }
            ]
          });
        } else {
          const category = await categoryChecker.getCategory(tab.url);
          setBlockedCategory(category || null);
          if (category && category !== 'category0') {
            setBlockedTabInfo({
              isMainTabBlocked: true,
              blockedTabs: [
                {
                  tabId: queryTabId,
                  title: tab.title || 'Untitled',
                  url: tab.url || '',
                  category
                }
              ]
            });
          } else {
            setBlockedTabInfo({ isMainTabBlocked: true, blockedTabs: [] });
          }
        }
      }
    } catch {
      setBlockedCategory(null);
      setBlockedTabInfo({ isMainTabBlocked: true, blockedTabs: [] });
    }
  }, [queryTabId]);

  return {
    ensureCurrentTabIsMainInGroup,
    refreshBlockedState
  };
}
