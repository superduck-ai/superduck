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

type RuntimeMessage = { type: string; [key: string]: unknown };
type RuntimeSendResponse = (response: Record<string, unknown>) => void;

function getOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isScheduledTask(value: unknown): value is ScheduledTask {
  return (
    isRecord(value) &&
    typeof value.prompt === "string" &&
    (value.id === undefined || typeof value.id === "string") &&
    (value.name === undefined || typeof value.name === "string") &&
    (value.url === undefined || typeof value.url === "string") &&
    (value.enabled === undefined || typeof value.enabled === "boolean") &&
    (value.skipPermissions === undefined || typeof value.skipPermissions === "boolean") &&
    (value.model === undefined || typeof value.model === "string")
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

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
    const tabId = getOptionalNumber(message.tabId) ?? sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: false });
      return;
    }

    await deps.openSidePanelRequest({
      tabId,
      prompt: getOptionalString(message.prompt),
      permissionMode: message.permissionMode,
      selectedModel: getOptionalString(message.selectedModel),
      attachments: message.attachments,
      conversationUuid: getOptionalString(message.conversationUuid),
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

      const resolvedTargetTabId = targetTabId;
      chrome.tabs
        .sendMessage(resolvedTargetTabId, { type: "HIDE_AGENT_INDICATORS" })
        .catch(() => {});
      tabGroupManager.setTabIndicatorState(resolvedTargetTabId, "none").catch(() => {});

      chrome.runtime.sendMessage({ type: "STOP_AGENT", targetTabId: resolvedTargetTabId }).catch(() => {
        deps
          .openSidePanel(resolvedTargetTabId)
          .then(() => {
            setTimeout(() => {
              chrome.runtime
                .sendMessage({ type: "STOP_AGENT", targetTabId: resolvedTargetTabId })
                .catch(() => {});
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
      sendResponse({ success: false, error: getErrorMessage(err) });
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
          sendResponse({ success: false, error: getErrorMessage(err) });
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
        const method = getOptionalString(message.method);
        const params = isRecord(message.params) ? message.params : undefined;
        if (!method) {
          sendResponse({ success: false });
          return;
        }
        const nativeSent = deps.sendMcpNotification(method, params);
        const bridgeSent = sendMcpNotificationViaBridge(method, params);
        sendResponse({ success: nativeSent || bridgeSent });
        return;
      }

      if (message.type === "OPEN_OPTIONS_WITH_TASK") {
        try {
          if (!isScheduledTask(message.task)) {
            sendResponse({ success: false, error: "Invalid task payload" });
            return;
          }
          await deps.openOptionsWithTask(message.task);
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: getErrorMessage(err) });
        }
        return;
      }

      if (message.type === "EXECUTE_SCHEDULED_TASK") {
        try {
          if (!isScheduledTask(message.task)) {
            sendResponse({ success: false, error: "Invalid task payload" });
            return;
          }
          const runLogId = getOptionalString(message.runLogId);
          if (!runLogId) {
            sendResponse({ success: false, error: "Missing runLogId" });
            return;
          }
          await deps.executeScheduledTask(message.task, runLogId);
          void trackEvent("superduck.scheduled_task.executed", {
            task_id: message.task.id,
            task_name: message.task.name,
            success: true,
            execution_type: message.isManual === true ? "manual" : "automatic",
          });
          sendResponse({ success: true });
        } catch (err) {
          const errorMessage = getErrorMessage(err);
          void trackEvent("superduck.scheduled_task.executed", {
            task_id: message.task.id,
            task_name: message.task.name,
            success: false,
            execution_type: message.isManual === true ? "manual" : "automatic",
            error: errorMessage,
          });
          sendResponse({ success: false, error: errorMessage });
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
            secondaryTabId: getOptionalNumber(message.secondaryTabId),
            mainTabId: getOptionalNumber(message.mainTabId),
            timestamp: getOptionalNumber(message.timestamp),
          },
          (response) => {
            sendResponse(response?.success ? { success: true } : { success: false });
          },
        );
        return;
      }

      if (message.type === "MAIN_TAB_ACK_RESPONSE") {
        sendResponse({ success: message.success === true });
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
