import { setStorageValue, StorageKeys } from "../extensionServices";
import { tabGroupManager } from "../mcpRuntime";
import type { ScheduledTask } from "./types";

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

  async function openSidePanel(tabId: number) {
    chrome.sidePanel.setOptions({
      tabId,
      path: `sidepanel.html?tabId=${encodeURIComponent(tabId)}`,
      enabled: true,
    });
    chrome.sidePanel.open({ tabId });

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
        type: "POPULATE_INPUT_TEXT",
        prompt: request.prompt,
        permissionMode: request.permissionMode,
        selectedModel: request.selectedModel,
        attachments: request.attachments,
      });
    }

    if (request.conversationUuid) {
      await retryRuntimeMessage({
        type: "LOAD_CONVERSATION",
        conversationUuid: request.conversationUuid,
      });
    }
  }

  async function handleActionClick(tab: chrome.tabs.Tab) {
    if (tab.id) {
      await openSidePanel(tab.id);
    }
  }

  async function openOptionsForSetup(): Promise<void> {
    const optionsBaseUrl = chrome.runtime.getURL("options.html");
    const targetUrl = chrome.runtime.getURL("options.html#permissions");
    const tabs = await chrome.tabs.query({});
    const existingTab = tabs.find((tab) => typeof tab.url === "string" && tab.url.startsWith(optionsBaseUrl));

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

    const optionsBaseUrl = chrome.runtime.getURL("options.html");
    const promptsUrl = chrome.runtime.getURL("options.html#prompts");
    const tabs = await chrome.tabs.query({});
    const existingTab = tabs.find((tab) => tab.url?.startsWith(optionsBaseUrl));

    if (existingTab?.id) {
      await chrome.tabs.update(existingTab.id, {
        url: promptsUrl,
        active: true,
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
    openOptionsWithTask,
  };
}
