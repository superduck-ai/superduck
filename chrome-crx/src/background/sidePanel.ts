import { SIDE_PANEL_SET_ACTIVE_TAB } from '../constants/runtimeMessages';
import { setStorageValue, StorageKeys } from '../extensionServices';
import { migrateGroupFinalizationState, tabGroupManager } from '../mcpRuntime';
import type { ScheduledTask } from './types';

// Count of alive sidepanel iframes, persisted to session storage to survive
// SW restarts.
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
  function setSidePanelOptions(
    options: Parameters<typeof chrome.sidePanel.setOptions>[0]
  ): Promise<void> {
    try {
      return chrome.sidePanel.setOptions(options).catch((err) => {
        console.error('[superduck:sidepanel] setOptions FAILED', err);
      });
    } catch (err) {
      console.error('[superduck:sidepanel] setOptions FAILED', err);
      return Promise.resolve();
    }
  }

  function enableSidePanelForTab(tabId: number): Promise<void> {
    return setSidePanelOptions({
      tabId,
      path: 'sidepanel.html',
      enabled: true
    });
  }

  async function getWorkspaceSidePanelDisableTargets(tabId: number): Promise<number[]> {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (typeof tab.groupId === 'number' && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        const groupTabs = await chrome.tabs.query({ groupId: tab.groupId });
        const groupTabIds = groupTabs.flatMap((groupTab) =>
          typeof groupTab.id === 'number' ? [groupTab.id] : []
        );
        if (groupTabIds.length > 0) return groupTabIds;
      }
    } catch {
      // Fall back to the active tab.
    }
    return [tabId];
  }

  async function hideSidePanelForWorkspaceTab(tabId: number): Promise<void> {
    const targetTabIds = await getWorkspaceSidePanelDisableTargets(tabId);
    await Promise.all(
      targetTabIds.map((targetTabId) =>
        setSidePanelOptions({
          tabId: targetTabId,
          enabled: false
        })
      )
    );
  }

  async function notifySidePanelTargetTab(tabId: number): Promise<void> {
    let windowId: number;
    try {
      const tab = await chrome.tabs.get(tabId);
      windowId = tab.windowId;
    } catch {
      return;
    }

    try {
      chrome.runtime.sendMessage(
        {
          type: SIDE_PANEL_SET_ACTIVE_TAB,
          tabId,
          windowId
        },
        () => {
          // Touch lastError so Chrome does not report an unchecked runtime error.
          void chrome.runtime.lastError;
        }
      );
    } catch {
      // No live sidepanel is a valid state.
    }
  }

  function didHandleRuntimeMessage(response: unknown): boolean {
    return (
      typeof response === 'object' &&
      response !== null &&
      (response as { success?: unknown }).success === true
    );
  }

  async function sendRuntimeMessage(message: Record<string, unknown>): Promise<unknown> {
    return await new Promise<unknown>((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  async function retryRuntimeMessage(message: Record<string, unknown>) {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 800 : 500));
        const response = await sendRuntimeMessage(message);
        if (didHandleRuntimeMessage(response)) return;
      } catch {
        if (attempt === 5) return;
      }
    }
  }

  async function openSidePanel(tabId: number, gestureCapable = false) {
    // IMPORTANT: chrome.sidePanel.open() must run inside the user-gesture chain
    // that triggered it (Chrome 127+). Do not await before open(). We first
    // enqueue the tab-specific enable call, then open that same tab-specific
    // panel so workspace tabs never fall back to the manifest default panel.
    void enableSidePanelForTab(tabId);

    if (gestureCapable) {
      try {
        chrome.sidePanel.open({ tabId }).catch((err) => {
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
      } else if (group.mainTabId !== tabId) {
        try {
          await tabGroupManager.promoteToMainTab(group.mainTabId, tabId);
          migrateGroupFinalizationState(group.mainTabId, tabId);
        } catch {
          // ignore
        }
      }
      await notifySidePanelTargetTab(tabId);
      return;
    }

    try {
      await tabGroupManager.createGroup(tabId);
      await notifySidePanelTargetTab(tabId);
    } catch {
      // ignore
    }

    void connectNativeHost();
  }

  async function handleTabActivated(activeInfo: { tabId: number; windowId: number }) {
    try {
      await tabGroupManager.initialize(true);
      const group = await tabGroupManager.findGroupByTab(activeInfo.tabId);

      // `isUnmanaged` means a regular Chrome group that can be adopted only
      // after an explicit open action; activation alone is not consent.
      if (group && !group.isUnmanaged) {
        await enableSidePanelForTab(activeInfo.tabId);
        return;
      }
      await hideSidePanelForWorkspaceTab(activeInfo.tabId);
    } catch {
      await hideSidePanelForWorkspaceTab(activeInfo.tabId);
    }
  }

  async function openSidePanelRequest(request: OpenSidePanelRequest) {
    await openSidePanel(request.tabId);

    if (request.prompt) {
      await retryRuntimeMessage({
        type: 'POPULATE_INPUT_TEXT',
        prompt: request.prompt,
        targetTabId: request.tabId,
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
    if (tab.id !== undefined) {
      await openSidePanel(tab.id, true);
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
    handleTabActivated,
    openOptionsForSetup,
    openOptionsWithTask
  };
}
