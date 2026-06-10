import { setStorageValue, StorageKeys } from '../extensionServices';
import { tabGroupManager } from '../mcpRuntime';
import type { ScheduledTask } from './types';

// Count of alive sidepanel iframes, persisted to session storage to survive
// SW restarts. When > 0, openSidePanel skips setOptions to avoid reloading
// any live iframe and killing a running agent.
const PANEL_ALIVE_COUNT_KEY = 'panelAliveCount';
let alivePanelCount = 0;
let initialized = false;

async function initPanelAliveCount(): Promise<void> {
  if (initialized) return;
  const result = await chrome.storage.session.get(PANEL_ALIVE_COUNT_KEY);
  alivePanelCount =
    typeof result[PANEL_ALIVE_COUNT_KEY] === 'number' ? result[PANEL_ALIVE_COUNT_KEY] : 0;
  initialized = true;
}

async function persistPanelAliveCount(): Promise<void> {
  await chrome.storage.session.set({ [PANEL_ALIVE_COUNT_KEY]: alivePanelCount });
}

export async function incrementPanelAlive(): Promise<void> {
  await initPanelAliveCount();
  alivePanelCount++;
  await persistPanelAliveCount();
}

export async function decrementPanelAlive(): Promise<void> {
  await initPanelAliveCount();
  alivePanelCount = Math.max(0, alivePanelCount - 1);
  await persistPanelAliveCount();
}

export async function isPanelAlive(): Promise<boolean> {
  await initPanelAliveCount();
  return alivePanelCount > 0;
}

export interface OpenSidePanelRequest {
  tabId: number;
  prompt?: string;
  permissionMode?: unknown;
  selectedModel?: string;
  attachments?: unknown;
  conversationUuid?: string;
}

export interface SidePanelControllerDeps {
  connectNativeHost: () => Promise<boolean>;
}

export function createSidePanelController({ connectNativeHost }: SidePanelControllerDeps) {
  async function sendRuntimeMessage(message: Record<string, unknown>): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      chrome.runtime.sendMessage(message, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  async function retryRuntimeMessage(message: Record<string, unknown>) {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 800 : 500));
        await sendRuntimeMessage(message);
        return;
      } catch {
        if (attempt === 5) return;
      }
    }
  }

  async function openSidePanel(tabId: number, windowId?: number, gestureCapable = false) {
    // Use window-bound opening instead of tab-bound to allow the sidepanel to
    // survive tab switches. The sidepanel will track the active tab dynamically
    // via chrome.tabs.onActivated.
    //
    // IMPORTANT: chrome.sidePanel.open() must run inside the user-gesture chain
    // that triggered it (Chrome 127+). The `await` in chrome.tabs.get() below
    // would break that chain and cause open() to reject with "may only be
    // called in response to a user gesture". When the caller already has a
    // `chrome.tabs.Tab` (e.g. from chrome.action.onClicked), we accept its
    // `windowId` and call open() synchronously so the gesture chain stays
    // intact. The `await tabs.get(tabId)` fallback only runs for non-gesture
    // callers (runtime messages) — those paths can't open the panel anyway
    // because they have no user gesture, so the await is harmless there.
    //
    // gestureCapable: only call chrome.sidePanel.open() when the caller is
    // inside a user-gesture chain (e.g. chrome.action.onClicked,
    // chrome.commands.onCommand). Runtime message handlers and STOP_AGENT
    // fallbacks have no gesture and open() would always reject — skip it
    // and rely on setOptions so the panel opens on the next user click.
    let resolvedWindowId = windowId;
    if (typeof resolvedWindowId !== 'number') {
      const tab = await chrome.tabs.get(tabId);
      resolvedWindowId = tab.windowId;
    }

    // Skip setOptions when panel is alive to avoid reloading the iframe.
    // The sidepanel tracks the active tab dynamically via useActiveTabId.
    if (await isPanelAlive()) {
      console.debug('[superduck:sidepanel] panel alive, skipping setOptions');
    } else {
      try {
        chrome.sidePanel.setOptions({
          path: `sidepanel.html?initialTabId=${encodeURIComponent(tabId)}`,
          enabled: true
        });
      } catch (err) {
        console.error('[superduck:sidepanel] setOptions FAILED', err);
      }
    }

    if (gestureCapable) {
      try {
        // Fire-and-forget: do NOT await. chrome.sidePanel.open() must run
        // inside the user gesture chain that triggered it, and the gesture
        // expires across an await. Awaiting here would reject open() with
        // "may only be called in response to a user gesture" on the
        // chrome.commands.onCommand path (Ctrl+E) — where the gesture is
        // real but any await between the callback and open() breaks the
        // chain. The follow-up tabGroupManager calls below don't need a
        // user gesture, so they're free to await.
        chrome.sidePanel.open({ windowId: resolvedWindowId }).catch((err) => {
          console.error('[superduck:sidepanel] open() FAILED', err);
        });
      } catch (err) {
        console.error('[superduck:sidepanel] open() FAILED', err);
      }
    } else {
      console.debug(
        '[superduck:sidepanel] skipping open() — no user gesture; setOptions configured panel for next click'
      );
    }

    await tabGroupManager.initialize(true);
    const group = await tabGroupManager.findGroupByTab(tabId);

    if (group) {
      if (group.isUnmanaged) {
        try {
          await tabGroupManager.adoptOrphanedGroup(tabId, group.chromeGroupId);
        } catch {
          // ignore
        }
      }
      return;
    }

    try {
      await tabGroupManager.createGroup(tabId);
    } catch {
      // ignore
    }

    void connectNativeHost();
  }

  async function openSidePanelRequest(request: OpenSidePanelRequest) {
    await openSidePanel(request.tabId);

    if (request.prompt) {
      await retryRuntimeMessage({
        type: 'POPULATE_INPUT_TEXT',
        prompt: request.prompt,
        permissionMode: request.permissionMode,
        selectedModel: request.selectedModel,
        attachments: request.attachments
      });
    }

    if (request.conversationUuid) {
      await retryRuntimeMessage({
        type: 'LOAD_CONVERSATION',
        conversationUuid: request.conversationUuid
      });
    }
  }

  async function handleActionClick(tab: chrome.tabs.Tab) {
    if (tab.id !== undefined && tab.windowId !== undefined) {
      await openSidePanel(tab.id, tab.windowId, true);
    } else if (tab.id !== undefined) {
      await openSidePanel(tab.id, undefined, true);
    }
  }

  async function openOptionsForSetup(): Promise<void> {
    const optionsBaseUrl = chrome.runtime.getURL('options.html');
    const targetUrl = chrome.runtime.getURL('options.html#permissions');
    const tabs = await chrome.tabs.query({});
    const existingTab = tabs.find(
      (tab) => typeof tab.url === 'string' && tab.url.startsWith(optionsBaseUrl)
    );

    if (existingTab?.id) {
      await chrome.tabs.update(existingTab.id, { url: targetUrl, active: true });
      if (existingTab.windowId) {
        await chrome.windows.update(existingTab.windowId, { focused: true });
      }
      return;
    }

    await chrome.tabs.create({ url: targetUrl });
  }

  async function openOptionsWithTask(task: ScheduledTask) {
    await setStorageValue(StorageKeys.PENDING_SCHEDULED_TASK, task);

    const optionsBaseUrl = chrome.runtime.getURL('options.html');
    const promptsUrl = chrome.runtime.getURL('options.html#prompts');
    const tabs = await chrome.tabs.query({});
    const existingTab = tabs.find((tab) => tab.url?.startsWith(optionsBaseUrl));

    if (existingTab?.id) {
      await chrome.tabs.update(existingTab.id, {
        url: promptsUrl,
        active: true
      });
      if (existingTab.windowId) {
        await chrome.windows.update(existingTab.windowId, { focused: true });
      }
      return;
    }

    await chrome.tabs.create({ url: promptsUrl });
  }

  return {
    openSidePanel,
    openSidePanelRequest,
    handleActionClick,
    openOptionsForSetup,
    openOptionsWithTask
  };
}
