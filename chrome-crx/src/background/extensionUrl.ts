import { connectBridge, resetMcpState, tabGroupManager, trackEvent } from '../mcpRuntime';

const CHROME_URL_PREFIX = '/chrome/';

export interface ExtensionUrlHandlerDeps {
  connectNativeHost: () => Promise<boolean>;
  disconnectNativeHost: () => Promise<boolean>;
}

export function createExtensionUrlHandler({
  connectNativeHost,
  disconnectNativeHost
}: ExtensionUrlHandlerDeps) {
  async function closeTab(tabId: number) {
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // ignore
    }
  }

  async function handleTabSwitch(targetTabId: number, callerTabId: number) {
    if (Number.isNaN(targetTabId)) {
      void trackEvent('superduck.extension_url.tab_switch', {
        success: false,
        error: 'invalid_tab_id'
      });
      await closeTab(callerTabId);
      return;
    }

    try {
      await tabGroupManager.initialize();
      const group = await tabGroupManager.findGroupByTab(targetTabId);

      if (!group || group.isUnmanaged) {
        void trackEvent('superduck.extension_url.tab_switch', {
          success: false,
          error: 'tab_not_managed'
        });
        await closeTab(callerTabId);
        return;
      }

      const tab = await chrome.tabs.get(targetTabId);
      if (tab.windowId !== undefined) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      await chrome.tabs.update(targetTabId, { active: true });
      void trackEvent('superduck.extension_url.tab_switch', { success: true });
      await closeTab(callerTabId);
    } catch {
      void trackEvent('superduck.extension_url.tab_switch', { success: false });
      await closeTab(callerTabId);
    }
  }

  async function handleExtensionUrl(url: string, tabId: number): Promise<boolean> {
    try {
      const parsed = new URL(url);
      if (parsed.host !== 'clau.de') return false;

      if (parsed.pathname.toLowerCase() === '/chrome/permissions') {
        try {
          const optionsUrl = chrome.runtime.getURL('options.html#permissions');
          await chrome.tabs.create({ url: optionsUrl });
        } catch {
          // ignore
        } finally {
          await closeTab(tabId);
        }
        return true;
      }

      if (!parsed.pathname.startsWith(CHROME_URL_PREFIX)) return false;

      const subPath = parsed.pathname.substring(CHROME_URL_PREFIX.length).toLowerCase();

      if (subPath === 'reconnect') {
        try {
          await disconnectNativeHost();
          await resetMcpState();
          await new Promise((resolve) => setTimeout(resolve, 500));
          const [nativeSuccess, bridgeInitiated] = await Promise.all([
            connectNativeHost(),
            connectBridge()
          ]);
          void trackEvent('superduck.extension_url.reconnect', {
            native_host_success: nativeSuccess,
            bridge_initiated: bridgeInitiated
          });
        } catch {
          void trackEvent('superduck.extension_url.reconnect', { success: false });
        } finally {
          await closeTab(tabId);
        }
        return true;
      }

      if (subPath.startsWith('tab/')) {
        await handleTabSwitch(parseInt(subPath.substring(4), 10), tabId);
        return true;
      }

      return false;
    } catch {
      void trackEvent('superduck.extension_url.unknown_exception', {});
      return false;
    }
  }

  return {
    handleExtensionUrl
  };
}
