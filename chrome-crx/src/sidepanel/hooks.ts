import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { SIDE_PANEL_SET_ACTIVE_TAB } from '../constants/runtimeMessages';
import { getTabEventManager, tabGroupManager } from '../mcpRuntime';
import { normalizeApiBaseUrl, parseTabId } from './sidepanelUtils';

type TabChangeInfo = chrome.tabs.OnUpdatedInfo & {
  active?: boolean;
  removed?: boolean;
};
type Tab = chrome.tabs.Tab;

interface TabManager {
  subscribe: (
    tabId: number,
    properties: string[],
    callback: (tabId: number, changeInfo: TabChangeInfo, tab?: Tab) => void
  ) => string;
  unsubscribe: (subscriptionId: string) => void;
}

const tabManager: TabManager = {
  subscribe: (tabId, properties, callback) =>
    getTabEventManager().subscribe(tabId, properties, callback),
  unsubscribe: (subscriptionId) => getTabEventManager().unsubscribe(subscriptionId)
};

async function isManagedSuperDuckTab(tabId: number): Promise<boolean> {
  try {
    await tabGroupManager.initialize(true);
    const group = await tabGroupManager.findGroupByTab(tabId);
    return Boolean(group && !group.isUnmanaged);
  } catch {
    return false;
  }
}

/**
 * Subscribe to tab change events for a specific tab.
 */
export function useTabEvent(
  tabId: number | undefined,
  properties: string[],
  callback: (tabId: number, changeInfo: TabChangeInfo, tab?: Tab) => void,
  deps: React.DependencyList = []
) {
  const subscriptionRef = useRef<string | null>(null);
  const stableCallback = useCallback(callback, deps);

  useEffect(() => {
    if (tabId === undefined) return;

    subscriptionRef.current = tabManager.subscribe(tabId, properties, stableCallback);

    return () => {
      if (subscriptionRef.current) {
        tabManager.unsubscribe(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [tabId, properties, stableCallback]);
}

/**
 * Subscribe to URL/status changes for a specific tab and receive updates via callback.
 */
export function useTabUrlChange(
  tabId: number | undefined,
  onUpdate: (tab: Tab) => void,
  properties: string[] = ['url', 'status'],
  deps: React.DependencyList = []
) {
  const stableOnUpdate = useCallback(
    (id: number, _changeInfo: TabChangeInfo, tab?: Tab) => {
      if (id === tabId && tab) onUpdate(tab);
    },
    [tabId, ...deps]
  );

  useTabEvent(tabId, properties, stableOnUpdate, [stableOnUpdate]);
}

/**
 * Dynamically track the currently active tab in the current window.
 * This allows the sidepanel to survive tab switches — the panel stays open
 * (window-bound, not tab-bound) and updates its target tab when the user
 * switches tabs.
 *
 * Falls back to the initialTabId from the URL query string if tabs.onActivated
 * is not available (e.g., in tests).
 */
export function useActiveTabId(initialTabId: number | undefined): number | undefined {
  const [activeTabId, setActiveTabId] = useState<number | undefined>(initialTabId);

  useEffect(() => {
    // Track which Chrome window this sidepanel belongs to. The
    // `onActivated` event fires for tab switches in every window, so
    // without this filter a sidepanel opened in window A would retarget
    // to window B's tabs when the user switched tabs over there. Use
    // `chrome.windows.getCurrent` when available; fall back to the
    // windowId of the initial tab on the URL when not (e.g. some test
    // harnesses don't implement getCurrent).
    let myWindowId: number | undefined;
    let disposed = false;
    let activationSequence = 0;

    async function getCurrentWindowId(): Promise<number | undefined> {
      try {
        if (typeof chrome.windows?.getCurrent !== 'function') return undefined;
        const currentWindow = await chrome.windows.getCurrent();
        return currentWindow.id;
      } catch {
        return undefined;
      }
    }

    async function ensureCurrentWindowId(): Promise<number | undefined> {
      if (typeof myWindowId !== 'number') {
        myWindowId = await getCurrentWindowId();
      }
      return myWindowId;
    }

    function getActiveRealTab(): Promise<chrome.tabs.Tab | undefined> {
      return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          resolve(
            tabs.find((tab) => !tab.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`))
          );
        });
      });
    }

    async function syncActiveRealTab(): Promise<void> {
      await ensureCurrentWindowId();
      const real = await getActiveRealTab();
      if (disposed || real?.id == null) return;

      if (typeof myWindowId === 'number' && real.windowId !== myWindowId) {
        return;
      }
      myWindowId = real.windowId;

      if (await isManagedSuperDuckTab(real.id)) {
        if (!disposed) setActiveTabId(real.id);
      }
    }

    void syncActiveRealTab();

    if (typeof initialTabId === 'number') {
      void chrome.tabs
        .get(initialTabId)
        .then((tab) => {
          if (typeof myWindowId !== 'number') {
            myWindowId = tab.windowId;
          }
        })
        .catch(() => {
          // initialTabId may be invalid in some environments; ignore.
        });
    }

    const onRuntimeMessage = (message: unknown) => {
      if (typeof message !== 'object' || message === null) return;
      if ((message as { type?: unknown }).type !== SIDE_PANEL_SET_ACTIVE_TAB) return;

      const tabId = (message as { tabId?: unknown }).tabId;
      if (typeof tabId !== 'number') return;

      const sequence = ++activationSequence;
      void (async () => {
        const currentWindowId = await ensureCurrentWindowId();
        const messageWindowId = (message as { windowId?: unknown }).windowId;
        let targetWindowId = typeof messageWindowId === 'number' ? messageWindowId : undefined;

        if (typeof targetWindowId !== 'number') {
          try {
            targetWindowId = (await chrome.tabs.get(tabId)).windowId;
          } catch {
            return;
          }
        }

        if (
          disposed ||
          sequence !== activationSequence ||
          (typeof currentWindowId === 'number' && targetWindowId !== currentWindowId)
        ) {
          return;
        }

        if (typeof myWindowId !== 'number') {
          myWindowId = targetWindowId;
        }

        const shouldTrackTab = await isManagedSuperDuckTab(tabId);
        if (!shouldTrackTab || disposed || sequence !== activationSequence) return;
        setActiveTabId(tabId);
      })();
    };

    // Listen for tab activation changes to track which tab is active.
    // Inlined the listener shape because `chrome.tabs.TabActiveInfo` is
    // not exported in the @types/chrome version this project pins to.
    const onActivated = (info: { tabId: number; windowId: number }) => {
      // Ignore activations from other windows — see filter above.
      if (typeof myWindowId === 'number' && info.windowId !== myWindowId) {
        return;
      }

      const sequence = ++activationSequence;
      void (async () => {
        const shouldTrackTab = await isManagedSuperDuckTab(info.tabId);
        if (!shouldTrackTab || disposed || sequence !== activationSequence) return;
        setActiveTabId(info.tabId);
      })();
    };

    chrome.runtime.onMessage.addListener(onRuntimeMessage);
    chrome.tabs.onActivated.addListener(onActivated);
    return () => {
      disposed = true;
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
      chrome.tabs.onActivated.removeListener(onActivated);
    };
  }, [initialTabId]);

  return activeTabId;
}

export interface SidepanelQueryState {
  tabId: number | undefined;
  mode: string;
  sessionId: string;
  mcpPermissionOnly: boolean;
  requestId: string;
  skipPermissions: boolean;
  apiUrl: string;
  apiKey: string;
  model: string;
}

export function useQueryState(): SidepanelQueryState {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const apiUrl =
      normalizeApiBaseUrl(params.get('api_url')) || normalizeApiBaseUrl(params.get('apiUrl')) || '';
    const apiKey = (params.get('api_key') || params.get('apiKey') || '').trim();
    const model = (params.get('model') || '').trim();

    return {
      // Support both old "tabId" and new "initialTabId" query params
      tabId: parseTabId(params.get('initialTabId')) ?? parseTabId(params.get('tabId')),
      mode: params.get('mode') || 'sidepanel',
      sessionId: params.get('sessionId') || '',
      mcpPermissionOnly: params.get('mcpPermissionOnly') === 'true',
      requestId: params.get('requestId') || '',
      skipPermissions: params.get('skipPermissions') === 'true',
      apiUrl,
      apiKey,
      model
    };
  }, []);
}
