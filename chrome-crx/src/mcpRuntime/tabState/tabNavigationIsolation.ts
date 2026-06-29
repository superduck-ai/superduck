import type { TabGroupManager } from './tabGroups';
import type { MemberState, TabMemberOrigin } from './types';
import {
  closeTabIfPresent,
  guardChildNavigation,
  isHttpUrl,
  isNavigationAllowedByPolicy,
  type NavigationPolicyContext
} from '../navigationIsolation';

export interface ChildTabNavigationPolicy extends NavigationPolicyContext {
  expiresAt: number;
  timeoutId?: ReturnType<typeof setTimeout>;
}

export const CHILD_TAB_NAVIGATION_POLICY_TTL_MS = 30000;

export function getMemberOrigin(state: MemberState | undefined): TabMemberOrigin {
  return state?.origin === 'agent' ? 'agent' : 'user';
}

export function normalizeMemberState(
  state: MemberState,
  origin: TabMemberOrigin = getMemberOrigin(state)
): MemberState {
  return {
    ...state,
    origin,
    disposition: state.disposition ?? 'active'
  };
}

export function startTabCreationListener(mgr: TabGroupManager): void {
  if (mgr.isTabCreationListenerStarted || !chrome.tabs.onCreated?.addListener) return;
  chrome.tabs.onCreated.addListener((tab) => {
    void handleTabCreated(mgr, tab);
  });
  mgr.isTabCreationListenerStarted = true;
}

export async function withPreservedActiveTab<T>(
  mgr: TabGroupManager,
  tabId: number,
  action: () => Promise<T>
): Promise<T> {
  let windowId: number | undefined;
  let activeTabId: number | undefined;
  try {
    const tab = await chrome.tabs.get(tabId);
    windowId = tab.windowId;
    const activeTabs = await chrome.tabs.query({ active: true, windowId });
    activeTabId = activeTabs[0]?.id;
    if (typeof activeTabId === 'number' && activeTabId !== tabId) {
      mgr.protectedActiveTabsByWindow.set(windowId, {
        tabId: activeTabId,
        expiresAt: Date.now() + 5000
      });
    }
  } catch {
    // Chrome cannot tell us the active tab — run the action anyway.
  }

  try {
    return await action();
  } finally {
    if (typeof windowId === 'number' && typeof activeTabId === 'number') {
      setTimeout(() => {
        const protectedTab = mgr.protectedActiveTabsByWindow.get(windowId);
        if (protectedTab?.tabId === activeTabId && protectedTab.expiresAt <= Date.now()) {
          mgr.protectedActiveTabsByWindow.delete(windowId);
        }
      }, 5000);
    }
  }
}

export async function handleTabCreated(mgr: TabGroupManager, tab: chrome.tabs.Tab): Promise<void> {
  const tabId = tab.id;
  const openerTabId = tab.openerTabId;
  if (typeof tabId !== 'number' || typeof openerTabId !== 'number') return;

  const policy = getChildTabNavigationPolicy(mgr, openerTabId);
  const action = await getCreatedChildTabAction(tab, policy);
  if (action === 'skip') return;
  if (action === 'close') {
    await closeTabIfPresent(tabId);
    await restoreProtectedActiveTab(mgr, tab);
    return;
  }

  const adopted = await adoptChildTabFromOpener(mgr, tab, openerTabId);
  if (adopted && policy) {
    guardChildNavigation(tabId, policy, {
      timeoutMs: Math.max(0, policy.expiresAt - Date.now()),
      onAllowed: (url) => mgr.updateTabBlocklistStatus(tabId, url)
    });
  }
  if (adopted) await restoreProtectedActiveTab(mgr, tab);
}

export function rememberChildTabNavigationPolicy(
  mgr: TabGroupManager,
  openerTabId: number,
  policy: Omit<ChildTabNavigationPolicy, 'expiresAt' | 'timeoutId'>,
  ttlMs = CHILD_TAB_NAVIGATION_POLICY_TTL_MS
): void {
  const previous = mgr.childTabNavigationPoliciesByOpener.get(openerTabId);
  if (previous?.timeoutId) clearTimeout(previous.timeoutId);

  const record: ChildTabNavigationPolicy = {
    ...policy,
    expiresAt: Date.now() + ttlMs
  };
  record.timeoutId = setTimeout(() => {
    if (mgr.childTabNavigationPoliciesByOpener.get(openerTabId) === record) {
      mgr.childTabNavigationPoliciesByOpener.delete(openerTabId);
    }
  }, ttlMs);
  (record.timeoutId as { unref?: () => void }).unref?.();
  mgr.childTabNavigationPoliciesByOpener.set(openerTabId, record);
}

export async function adoptChildTabsFromOpener(
  mgr: TabGroupManager,
  openerTabId: number
): Promise<number[]> {
  const mainTabId = await findManagedMainTabIdForTab(mgr, openerTabId);
  if (typeof mainTabId !== 'number') return [];

  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return [];
  }

  const adoptedTabIds: number[] = [];
  for (const tab of tabs) {
    if (typeof tab.id !== 'number' || tab.openerTabId !== openerTabId) continue;
    if (await adoptChildTab(mgr, mainTabId, tab)) adoptedTabIds.push(tab.id);
    await restoreProtectedActiveTab(mgr, tab);
  }
  return adoptedTabIds;
}

export async function createChildTabInGroup(
  mgr: TabGroupManager,
  openerTabId: number,
  url: string
): Promise<number | undefined> {
  const mainTabId = await findManagedMainTabIdForTab(mgr, openerTabId);
  if (typeof mainTabId !== 'number') return undefined;

  try {
    const existingTabs = await chrome.tabs.query({});
    const existingTab = existingTabs.find(
      (tab) => tab.openerTabId === openerTabId && tab.url === url && typeof tab.id === 'number'
    );
    if (existingTab?.id) {
      await adoptChildTab(mgr, mainTabId, existingTab);
      return existingTab.id;
    }
  } catch {
    // Fall through to creating the tab if the scan fails.
  }

  let newTab: chrome.tabs.Tab;
  try {
    newTab = await chrome.tabs.create({
      url,
      active: false,
      openerTabId
    });
  } catch {
    return undefined;
  }

  if (typeof newTab.id !== 'number') return undefined;
  await adoptChildTab(mgr, mainTabId, { ...newTab, openerTabId });
  return newTab.id;
}

async function adoptChildTabFromOpener(
  mgr: TabGroupManager,
  tab: chrome.tabs.Tab,
  openerTabId: number
): Promise<boolean> {
  const mainTabId = await findManagedMainTabIdForTab(mgr, openerTabId);
  if (typeof mainTabId !== 'number') return false;
  return await adoptChildTab(mgr, mainTabId, tab);
}

function getChildTabNavigationPolicy(
  mgr: TabGroupManager,
  openerTabId: number
): ChildTabNavigationPolicy | undefined {
  const policy = mgr.childTabNavigationPoliciesByOpener.get(openerTabId);
  if (!policy) return undefined;
  if (policy.expiresAt >= Date.now()) return policy;
  if (policy.timeoutId) clearTimeout(policy.timeoutId);
  mgr.childTabNavigationPoliciesByOpener.delete(openerTabId);
  return undefined;
}

async function getCreatedChildTabAction(
  tab: chrome.tabs.Tab,
  policy: ChildTabNavigationPolicy | undefined
): Promise<'adopt' | 'watch' | 'close' | 'skip'> {
  const url = tab.url || tab.pendingUrl;
  if (!policy) return 'skip';
  if (!url || url === 'about:blank') return 'watch';
  if (!isHttpUrl(url)) return 'adopt';
  return (await isNavigationAllowedByPolicy(url, policy)) ? 'adopt' : 'close';
}

async function adoptChildTab(
  mgr: TabGroupManager,
  mainTabId: number,
  tab: chrome.tabs.Tab
): Promise<boolean> {
  const tabId = tab.id;
  if (typeof tabId !== 'number') return false;
  const meta = mgr.groupMetadata.get(mainTabId);
  if (!meta) return false;

  try {
    const wasMember = meta.memberStates.has(tabId);
    const wasInGroup = tab.groupId === meta.chromeGroupId;
    if (wasMember && wasInGroup) return false;

    if (!wasInGroup) {
      await chrome.tabs.group({ tabIds: [tabId], groupId: meta.chromeGroupId });
    }
    if (!wasMember) {
      meta.memberStates.set(tabId, {
        indicatorState: 'static',
        origin: 'agent',
        disposition: 'active'
      });
    }
    if (tab.url) await mgr.updateTabBlocklistStatus(tabId, tab.url);
    await mgr.saveToStorage();
    const isDismissed = await mgr.isGroupDismissed(meta.chromeGroupId);
    if (!isDismissed) {
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'SHOW_STATIC_INDICATOR' });
      } catch {
        // New tabs often are not ready for content-script messages yet.
      }
    }
    return true;
  } catch {
    return false;
  }
}

async function findManagedMainTabIdForTab(
  mgr: TabGroupManager,
  tabId: number
): Promise<number | undefined> {
  await mgr.initialize();
  const syncMainTabId = mgr.findMainTabIdSync(tabId);
  if (typeof syncMainTabId === 'number') return syncMainTabId;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return undefined;
    return mgr.findMainTabInChromeGroup(tab.groupId) ?? undefined;
  } catch {
    return undefined;
  }
}

async function restoreProtectedActiveTab(
  mgr: TabGroupManager,
  tab: chrome.tabs.Tab
): Promise<void> {
  if (!tab.active || typeof tab.windowId !== 'number') return;
  const protectedTab = mgr.protectedActiveTabsByWindow.get(tab.windowId);
  if (!protectedTab || protectedTab.expiresAt < Date.now() || protectedTab.tabId === tab.id) {
    return;
  }

  try {
    await chrome.tabs.update(protectedTab.tabId, { active: true });
  } catch {
    // The user may have closed the tab while the agent was running.
  }
}
