import {
  isBridgeConnected,
  sendMcpNotificationViaBridge,
  tabGroupManager,
  trackEvent
} from '../mcpRuntime';
import { SIDE_PANEL_SET_ACTIVE_TAB } from '../constants/runtimeMessages';
import type { NativeHostResetResult, NativeHostStatus } from './nativeHost';
import type { OpenSidePanelRequest } from './sidePanel';
import { incrementPanelAlive, decrementPanelAlive } from './sidePanel';
import type { ScheduledTask } from './types';

type RuntimeMessage = { type: string; [key: string]: unknown };
type RuntimeSendResponse = (response: Record<string, unknown>) => void;

function getOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isScheduledTask(value: unknown): value is ScheduledTask {
  return (
    isRecord(value) &&
    typeof value.prompt === 'string' &&
    (value.id === undefined || typeof value.id === 'string') &&
    (value.name === undefined || typeof value.name === 'string') &&
    (value.url === undefined || typeof value.url === 'string') &&
    (value.enabled === undefined || typeof value.enabled === 'boolean') &&
    (value.skipPermissions === undefined || typeof value.skipPermissions === 'boolean') &&
    (value.model === undefined || typeof value.model === 'string')
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

const HANDLED_MESSAGE_TYPES = new Set([
  'PLAY_NOTIFICATION_SOUND',
  'open_side_panel',
  'check_native_host_status',
  'reset_native_host_connection',
  'restart_native_host',
  'SEND_MCP_NOTIFICATION',
  'OPEN_OPTIONS_WITH_TASK',
  'EXECUTE_SCHEDULED_TASK',
  'STOP_AGENT',
  'SWITCH_TO_MAIN_TAB',
  'MAIN_TAB_ACK_RESPONSE',
  'STATIC_INDICATOR_HEARTBEAT',
  'DISMISS_STATIC_INDICATOR_FOR_GROUP',
  'PANEL_READY',
  'PANEL_CLOSED'
]);

export interface RuntimeMessageListenerDeps {
  openSidePanelRequest: (request: OpenSidePanelRequest) => Promise<void>;
  openOptionsWithTask: (task: ScheduledTask) => Promise<void>;
  getNativeHostStatus: () => Promise<NativeHostStatus>;
  resetNativeHost: () => Promise<NativeHostResetResult>;
  sendMcpNotification: (method: string, params?: Record<string, unknown>) => boolean;
  executeScheduledTask: (task: ScheduledTask, runLogId: string) => Promise<void>;
  handleStaticIndicatorHeartbeat: (
    sender: chrome.runtime.MessageSender,
    sendResponse: RuntimeSendResponse
  ) => Promise<void>;
  handleDismissStaticIndicator: (
    sender: chrome.runtime.MessageSender,
    sendResponse: RuntimeSendResponse
  ) => Promise<void>;
}

export function registerRuntimeMessageListener(deps: RuntimeMessageListenerDeps) {
  function notifySidePanelTargetTab(tabId: number, windowId: number): void {
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

  async function ensureOffscreenDocument() {
    if (!chrome.offscreen) return;

    try {
      await chrome.offscreen.closeDocument();
    } catch {
      // May not exist yet.
    }

    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: 'Play notification sounds when user is on different tab'
    });
  }

  async function handleOpenSidePanel(
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: RuntimeSendResponse
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
      conversationUuid: getOptionalString(message.conversationUuid)
    });
    sendResponse({ success: true });
  }

  async function handleNativeHostStatus(sendResponse: RuntimeSendResponse) {
    try {
      const status = await deps.getNativeHostStatus();
      sendResponse({
        status: {
          nativeHostInstalled: status.nativeHostInstalled,
          mcpConnected: status.mcpConnected,
          connecting: status.connecting === true,
          reconnecting: status.reconnecting === true,
          bridgeConnected: isBridgeConnected()
        }
      });
    } catch (err) {
      sendResponse({
        status: {
          nativeHostInstalled: false,
          mcpConnected: false,
          connecting: false,
          reconnecting: false,
          bridgeConnected: isBridgeConnected(),
          error: getErrorMessage(err)
        }
      });
    }
  }

  async function handleResetNativeHost(sendResponse: RuntimeSendResponse) {
    try {
      const result = await deps.resetNativeHost();
      sendResponse({
        success: result.success,
        reconnecting: result.reconnecting === true,
        status: {
          nativeHostInstalled: result.status.nativeHostInstalled,
          mcpConnected: result.status.mcpConnected,
          connecting: result.status.connecting === true,
          reconnecting: result.reconnecting === true || result.status.reconnecting === true,
          bridgeConnected: isBridgeConnected()
        }
      });
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      sendResponse({
        success: false,
        error: errorMessage,
        status: {
          nativeHostInstalled: false,
          mcpConnected: false,
          connecting: false,
          reconnecting: false,
          bridgeConnected: isBridgeConnected(),
          error: errorMessage
        }
      });
    }
  }

  function handleStopAgent(
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: RuntimeSendResponse
  ) {
    const stopAgent = async () => {
      let targetTabId: number | undefined;

      if (message.fromTabId === 'CURRENT_TAB' && sender.tab?.id) {
        targetTabId = (await tabGroupManager.getMainTabId(sender.tab.id)) || sender.tab.id;
      } else if (typeof message.fromTabId === 'number') {
        targetTabId = message.fromTabId;
      }

      if (!targetTabId) {
        sendResponse({ success: true });
        return;
      }

      const resolvedTargetTabId = targetTabId;
      chrome.tabs
        .sendMessage(resolvedTargetTabId, { type: 'HIDE_AGENT_INDICATORS' })
        .catch(() => {});
      tabGroupManager.setTabIndicatorState(resolvedTargetTabId, 'none').catch(() => {});

      chrome.runtime
        .sendMessage({ type: 'STOP_AGENT', targetTabId: resolvedTargetTabId })
        .catch(() => {
          // Cannot open sidepanel here — chrome.sidePanel.open() requires a
          // user gesture and runtime message handlers have none. The panel
          // will open on the next user click via setOptions configuration.
          console.debug(
            '[superduck:stop-agent] STOP_AGENT delivery failed; panel will open on next user click'
          );
        });

      sendResponse({ success: true });
    };

    void stopAgent();
  }

  async function handleSwitchToMainTab(
    sender: chrome.runtime.MessageSender,
    sendResponse: RuntimeSendResponse
  ) {
    if (!sender.tab?.id) {
      sendResponse({ success: false, error: 'No sender tab' });
      return;
    }

    try {
      await tabGroupManager.initialize(true);
      const mainTabId = await tabGroupManager.getMainTabId(sender.tab.id);

      if (!mainTabId) {
        sendResponse({ success: false, error: 'No main tab found' });
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
      if (message.type === 'PLAY_NOTIFICATION_SOUND') {
        try {
          await ensureOffscreenDocument();
          await chrome.runtime.sendMessage({
            type: 'PLAY_NOTIFICATION_SOUND',
            audioUrl: message.audioUrl,
            volume: message.volume || 0.5
          });
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: getErrorMessage(err) });
        }
        return;
      }

      if (message.type === 'open_side_panel') {
        await handleOpenSidePanel(message, sender, sendResponse);
        return;
      }

      if (message.type === 'check_native_host_status') {
        await handleNativeHostStatus(sendResponse);
        return;
      }

      if (
        message.type === 'reset_native_host_connection' ||
        message.type === 'restart_native_host'
      ) {
        await handleResetNativeHost(sendResponse);
        return;
      }

      if (message.type === 'SEND_MCP_NOTIFICATION') {
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

      if (message.type === 'OPEN_OPTIONS_WITH_TASK') {
        try {
          if (!isScheduledTask(message.task)) {
            sendResponse({ success: false, error: 'Invalid task payload' });
            return;
          }
          await deps.openOptionsWithTask(message.task);
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: getErrorMessage(err) });
        }
        return;
      }

      if (message.type === 'EXECUTE_SCHEDULED_TASK') {
        try {
          if (!isScheduledTask(message.task)) {
            sendResponse({ success: false, error: 'Invalid task payload' });
            return;
          }
          const runLogId = getOptionalString(message.runLogId);
          if (!runLogId) {
            sendResponse({ success: false, error: 'Missing runLogId' });
            return;
          }
          await deps.executeScheduledTask(message.task, runLogId);
          void trackEvent('superduck.scheduled_task.executed', {
            task_id: message.task.id,
            task_name: message.task.name,
            success: true,
            execution_type: message.isManual === true ? 'manual' : 'automatic'
          });
          sendResponse({ success: true });
        } catch (err) {
          const errorMessage = getErrorMessage(err);
          void trackEvent('superduck.scheduled_task.executed', {
            task_id: message.task.id,
            task_name: message.task.name,
            success: false,
            execution_type: message.isManual === true ? 'manual' : 'automatic',
            error: errorMessage
          });
          sendResponse({ success: false, error: errorMessage });
        }
        return;
      }

      if (message.type === 'STOP_AGENT') {
        handleStopAgent(message, sender, sendResponse);
        return;
      }

      if (message.type === 'SWITCH_TO_MAIN_TAB') {
        await handleSwitchToMainTab(sender, sendResponse);
        return;
      }

      if (message.type === 'MAIN_TAB_ACK_RESPONSE') {
        sendResponse({ success: message.success === true });
        return;
      }

      if (message.type === 'STATIC_INDICATOR_HEARTBEAT') {
        await deps.handleStaticIndicatorHeartbeat(sender, sendResponse);
        return;
      }

      if (message.type === 'DISMISS_STATIC_INDICATOR_FOR_GROUP') {
        await deps.handleDismissStaticIndicator(sender, sendResponse);
        return;
      }

      if (message.type === 'PANEL_CLOSED') {
        await decrementPanelAlive();
        sendResponse({ success: true });
        return;
      }

      if (message.type === 'PANEL_READY') {
        await incrementPanelAlive();

        // PANEL_READY is only a mount/liveness signal. Group creation,
        // adoption, and promotion are explicit-open side effects handled by
        // openSidePanel(); a panel mount can happen while Chrome is switching
        // tabs, including on user workspace tabs that SuperDuck must not
        // claim.
        try {
          const [activeTab] = await chrome.tabs.query({
            active: true,
            lastFocusedWindow: true
          });
          if (activeTab?.id !== undefined && typeof activeTab.windowId === 'number') {
            await tabGroupManager.initialize(true);
            const existing = await tabGroupManager.findGroupByTab(activeTab.id);
            if (existing && !existing.isUnmanaged) {
              notifySidePanelTargetTab(activeTab.id, activeTab.windowId);
            }
          }
          sendResponse({ success: true });
        } catch (err) {
          console.error('[superduck:panel-ready] handler error', err);
          sendResponse({ success: false });
        }
        return;
      }
    })();

    return true;
  });
}
