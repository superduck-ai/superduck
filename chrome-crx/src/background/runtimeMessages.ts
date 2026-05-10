import { clearAuthData } from "../extensionServices";
import {
  clearStorageData,
  isBridgeConnected,
  sendMcpNotificationViaBridge,
  tabGroupManager,
  trackEvent,
} from "../mcpRuntime";
import type { NativeHostStatus } from "./nativeHost";
import type { ScheduledTask } from "./types";

type RuntimeMessage = { type: string; [key: string]: any };
type RuntimeSendResponse = (response: Record<string, unknown>) => void;

const HANDLED_MESSAGE_TYPES = new Set([
  "PLAY_NOTIFICATION_SOUND",
  "open_side_panel",
  "logout",
  "check_native_host_status",
  "SEND_MCP_NOTIFICATION",
  "OPEN_OPTIONS_WITH_TASK",
  "EXECUTE_SCHEDULED_TASK",
  "STOP_AGENT",
  "SWITCH_TO_MAIN_TAB",
  "SECONDARY_TAB_CHECK_MAIN",
  "MAIN_TAB_ACK_RESPONSE",
  "STATIC_INDICATOR_HEARTBEAT",
  "DISMISS_STATIC_INDICATOR_FOR_GROUP",
]);

export interface RuntimeMessageListenerDeps {
  openSidePanel: (tabId: number) => Promise<void>;
  openSidePanelRequest: (request: {
    tabId: number;
    prompt?: string;
    permissionMode?: unknown;
    selectedModel?: string;
    attachments?: unknown;
    conversationUuid?: string;
  }) => Promise<void>;
  openOptionsWithTask: (task: ScheduledTask) => Promise<void>;
  getNativeHostStatus: () => Promise<NativeHostStatus>;
  sendMcpNotification: (method: string, params?: Record<string, unknown>) => boolean;
  executeScheduledTask: (task: ScheduledTask, runLogId: string) => Promise<void>;
  handleStaticIndicatorHeartbeat: (
    sender: chrome.runtime.MessageSender,
    sendResponse: RuntimeSendResponse,
  ) => Promise<void>;
  handleDismissStaticIndicator: (
    sender: chrome.runtime.MessageSender,
    sendResponse: RuntimeSendResponse,
  ) => Promise<void>;
}

export function registerRuntimeMessageListener(deps: RuntimeMessageListenerDeps) {
  async function ensureOffscreenDocument() {
    if (!chrome.offscreen) return;

    try {
      await chrome.offscreen.closeDocument();
    } catch {
      // May not exist yet.
    }

    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: "Play notification sounds when user is on different tab",
    });
  }

  async function handleOpenSidePanel(
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: RuntimeSendResponse,
  ) {
    const tabId = message.tabId || sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: false });
      return;
    }

    await deps.openSidePanelRequest({
      tabId,
      prompt: message.prompt,
      permissionMode: message.permissionMode,
      selectedModel: message.selectedModel,
      attachments: message.attachments,
      conversationUuid: message.conversationUuid,
    });
    sendResponse({ success: true });
  }

  async function handleLogout(sendResponse: RuntimeSendResponse) {
    try {
      await clearAuthData();
      await tabGroupManager.clearAllGroups();
      await clearStorageData();
      sendResponse({ success: true });
    } catch {
      sendResponse({ success: false });
    }
  }

  async function handleNativeHostStatus(sendResponse: RuntimeSendResponse) {
    const status = await deps.getNativeHostStatus();
    sendResponse({
      status: {
        nativeHostInstalled: status.nativeHostInstalled,
        mcpConnected: status.mcpConnected || isBridgeConnected(),
      },
    });
  }

  function handleStopAgent(
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: RuntimeSendResponse,
  ) {
    const stopAgent = async () => {
      let targetTabId: number | undefined;

      if (message.fromTabId === "CURRENT_TAB" && sender.tab?.id) {
        targetTabId = (await tabGroupManager.getMainTabId(sender.tab.id)) || sender.tab.id;
      } else if (typeof message.fromTabId === "number") {
        targetTabId = message.fromTabId;
      }

      if (!targetTabId) {
        sendResponse({ success: true });
        return;
      }

      chrome.tabs.sendMessage(targetTabId, { type: "HIDE_AGENT_INDICATORS" }).catch(() => {});
      tabGroupManager.setTabIndicatorState(targetTabId, "none").catch(() => {});

      chrome.runtime.sendMessage({ type: "STOP_AGENT", targetTabId }).catch(() => {
        deps
          .openSidePanel(targetTabId!)
          .then(() => {
            setTimeout(() => {
              chrome.runtime.sendMessage({ type: "STOP_AGENT", targetTabId }).catch(() => {});
            }, 1500);
          })
          .catch(() => {});
      });

      sendResponse({ success: true });
    };

    void stopAgent();
  }

  async function handleSwitchToMainTab(
    sender: chrome.runtime.MessageSender,
    sendResponse: RuntimeSendResponse,
  ) {
    if (!sender.tab?.id) {
      sendResponse({ success: false, error: "No sender tab" });
      return;
    }

    try {
      await tabGroupManager.initialize(true);
      const mainTabId = await tabGroupManager.getMainTabId(sender.tab.id);

      if (!mainTabId) {
        sendResponse({ success: false, error: "No main tab found" });
        return;
      }

      await chrome.tabs.update(mainTabId, { active: true });
      const mainTab = await chrome.tabs.get(mainTabId);
      if (mainTab.windowId) {
        await chrome.windows.update(mainTab.windowId, { focused: true });
      }
      sendResponse({ success: true });
    } catch (err) {
      sendResponse({ success: false, error: (err as Error).message });
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message?.type || !HANDLED_MESSAGE_TYPES.has(message.type)) {
      return false;
    }

    void (async () => {
      if (message.type === "PLAY_NOTIFICATION_SOUND") {
        try {
          await ensureOffscreenDocument();
          await chrome.runtime.sendMessage({
            type: "PLAY_NOTIFICATION_SOUND",
            audioUrl: message.audioUrl,
            volume: message.volume || 0.5,
          });
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: (err as Error).message });
        }
        return;
      }

      if (message.type === "open_side_panel") {
        await handleOpenSidePanel(message, sender, sendResponse);
        return;
      }

      if (message.type === "logout") {
        await handleLogout(sendResponse);
        return;
      }

      if (message.type === "check_native_host_status") {
        await handleNativeHostStatus(sendResponse);
        return;
      }

      if (message.type === "SEND_MCP_NOTIFICATION") {
        const nativeSent = deps.sendMcpNotification(message.method, message.params);
        const bridgeSent = sendMcpNotificationViaBridge(message.method, message.params);
        sendResponse({ success: nativeSent || bridgeSent });
        return;
      }

      if (message.type === "OPEN_OPTIONS_WITH_TASK") {
        try {
          await deps.openOptionsWithTask(message.task as ScheduledTask);
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: (err as Error).message });
        }
        return;
      }

      if (message.type === "EXECUTE_SCHEDULED_TASK") {
        try {
          await deps.executeScheduledTask(message.task as ScheduledTask, message.runLogId);
          void trackEvent("superduck.scheduled_task.executed", {
            task_id: message.task.id,
            task_name: message.task.name,
            success: true,
            execution_type: message.isManual ? "manual" : "automatic",
          });
          sendResponse({ success: true });
        } catch (err) {
          void trackEvent("superduck.scheduled_task.executed", {
            task_id: message.task.id,
            task_name: message.task.name,
            success: false,
            execution_type: message.isManual ? "manual" : "automatic",
            error: (err as Error).message,
          });
          sendResponse({ success: false, error: (err as Error).message });
        }
        return;
      }

      if (message.type === "STOP_AGENT") {
        handleStopAgent(message, sender, sendResponse);
        return;
      }

      if (message.type === "SWITCH_TO_MAIN_TAB") {
        await handleSwitchToMainTab(sender, sendResponse);
        return;
      }

      if (message.type === "SECONDARY_TAB_CHECK_MAIN") {
        chrome.runtime.sendMessage(
          {
            type: "MAIN_TAB_ACK_REQUEST",
            secondaryTabId: message.secondaryTabId,
            mainTabId: message.mainTabId,
            timestamp: message.timestamp,
          },
          (response) => {
            sendResponse(response?.success ? { success: true } : { success: false });
          },
        );
        return;
      }

      if (message.type === "MAIN_TAB_ACK_RESPONSE") {
        sendResponse({ success: message.success });
        return;
      }

      if (message.type === "STATIC_INDICATOR_HEARTBEAT") {
        await deps.handleStaticIndicatorHeartbeat(sender, sendResponse);
        return;
      }

      if (message.type === "DISMISS_STATIC_INDICATOR_FOR_GROUP") {
        await deps.handleDismissStaticIndicator(sender, sendResponse);
      }
    })();

    return true;
  });
}
