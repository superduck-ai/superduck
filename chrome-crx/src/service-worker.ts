import {
  setStorageValue,
  StorageKeys,
  getConfig,
  clearAuthData,
  handleOAuthRedirect,
  savedPromptsService,
} from "./SavedPromptsService";
import {
  reconnectMcp,
  tabGroupManager,
  createErrorResponse,
  executeTool,
  trackEvent,
  resetMcpState,
  connectBridge,
  initializeExtensionPermissions,
  clearStorageData,
  isBridgeConnected,
  sendMcpNotificationViaBridge,
  syncPermissions,
} from "./mcpPermissions";
import { initModelMappingListener } from "./utils/modelMapping";

// --- Native Messaging State ---

const NATIVE_HOST_NAMES = [
  { name: "com.me.superduck_browser_extension", label: "Desktop" },
  { name: "com.me.superduck_code_browser_extension", label: "Code Client" },
] as const;

let nativePort: chrome.runtime.Port | null = null;
let connectedHostName: string | null = null;
let isConnecting = false;
let nativeHostInstalled = false;
let mcpConnected = false;
let statusResolve: ((value: { nativeHostInstalled: boolean; mcpConnected: boolean }) => void) | null = null;
let statusTimeout: ReturnType<typeof setTimeout> | null = null;

// --- Native Messaging Helpers ---

function handleDisconnectError(message?: string) {
  if (message?.includes("native messaging host not found")) {
    nativeHostInstalled = false;
  }
}

async function connectNativeHost(): Promise<boolean> {
  try {
    return await (async () => {
      if (nativePort) return true;
      if (isConnecting) return false;
      isConnecting = true;

      try {
        if (!(await chrome.permissions.contains({ permissions: ["nativeMessaging"] }))) return false;
        if (typeof chrome.runtime.connectNative !== "function") return false;

        for (const hostInfo of NATIVE_HOST_NAMES) {
          try {
            const port = chrome.runtime.connectNative(hostInfo.name);

            const connected = await new Promise<boolean>((resolve) => {
              let settled = false;

              const onDisconnect = () => {
                if (!settled) {
                  settled = true;
                  chrome.runtime.lastError;
                  resolve(false);
                }
              };

              const onMessage = (msg: { type: string }) => {
                if (!settled && msg.type === "pong") {
                  settled = true;
                  port.onDisconnect.removeListener(onDisconnect);
                  port.onMessage.removeListener(onMessage);
                  resolve(true);
                }
              };

              port.onDisconnect.addListener(onDisconnect);
              port.onMessage.addListener(onMessage);

              try {
                port.postMessage({ type: "ping" });
              } catch (_err) {
                if (!settled) {
                  settled = true;
                  resolve(false);
                }
                return;
              }

              setTimeout(() => {
                if (!settled) {
                  settled = true;
                  port.onDisconnect.removeListener(onDisconnect);
                  port.onMessage.removeListener(onMessage);
                  resolve(false);
                }
              }, 10_000);
            });

            if (connected) {
              nativePort = port;
              connectedHostName = hostInfo.name;
              nativeHostInstalled = true;

              nativePort.onMessage.addListener(async (msg) => {
                await handleNativeMessage(msg);
              });

              nativePort.onDisconnect.addListener(() => {
                const errorMsg = chrome.runtime.lastError?.message;
                nativePort = null;
                connectedHostName = null;
                mcpConnected = false;
                setStorageValue(StorageKeys.MCP_CONNECTED, false);
                handleDisconnectError(errorMsg);
                reconnectMcp();
              });

              nativePort.postMessage({ type: "get_status" });
              return true;
            }

            port.disconnect();
          } catch (_err) {
            // Try next host
          }
        }

        return false;
      } catch (err) {
        if (err instanceof Error) handleDisconnectError(err.message);
        return false;
      } finally {
        isConnecting = false;
      }
    })();
  } catch (_err) {
    return false;
  }
}

async function disconnectNativeHost(): Promise<boolean> {
  try {
    await chrome.permissions.remove({ permissions: ["nativeMessaging"] });
    nativePort?.disconnect();
    nativePort = null;
    connectedHostName = null;
    isConnecting = false;
    nativeHostInstalled = false;
    mcpConnected = false;
    return true;
  } catch (_err) {
    return false;
  }
}

// --- Native Message Handler ---

async function handleNativeMessage(msg: { type: string; [key: string]: unknown }) {
  switch (msg.type) {
    case "tool_request":
      await handleToolRequest(msg);
      break;

    case "status_response":
      if (statusResolve) {
        clearTimeout(statusTimeout!);
        statusTimeout = null;
        statusResolve({ nativeHostInstalled, mcpConnected });
        statusResolve = null;
      }
      break;

    case "mcp_connected":
      (async () => {
        mcpConnected = true;
        setStorageValue(StorageKeys.MCP_CONNECTED, true);
        await tabGroupManager.initialize();
        tabGroupManager.startTabGroupChangeListener();
      })();
      break;

    case "mcp_disconnected":
      mcpConnected = false;
      setStorageValue(StorageKeys.MCP_CONNECTED, false);
      tabGroupManager.stopTabGroupChangeListener();
      break;
  }
}

async function handleToolRequest(msg: { method?: string; params?: Record<string, unknown>; [key: string]: unknown }) {
  try {
    const { method, params } = msg as { method: string; params: Record<string, unknown> };

    if (method === "execute_tool") {
      if (!params?.tool) {
        sendToolResponse(createErrorResponse("No tool specified"));
        return;
      }

      const clientId = params.client_id as string | undefined;
      const rawTabGroupId = (params.args as Record<string, unknown>)?.tabGroupId;
      const tabGroupId =
        typeof rawTabGroupId === "number"
          ? rawTabGroupId
          : typeof rawTabGroupId === "string"
            ? parseInt(rawTabGroupId, 10) || undefined
            : undefined;

      const rawTabId = (params.args as Record<string, unknown>)?.tabId;
      const tabId =
        typeof rawTabId === "number"
          ? rawTabId
          : typeof rawTabId === "string"
            ? parseInt(rawTabId, 10) || undefined
            : undefined;

      sendToolResponse(
        await executeTool({
          toolName: params.tool as string,
          args: (params.args as Record<string, unknown>) || {},
          tabId,
          tabGroupId,
          clientId,
          source: "native-messaging",
          permissionMode: "skip_all_permission_checks",
        }),
        clientId,
      );
    } else {
      sendToolResponse({ content: `Unknown method: ${method}` });
    }
  } catch (err) {
    sendToolResponse(createErrorResponse(`Tool execution failed: ${err instanceof Error ? err.message : "Unknown error"}`));
  }
}

function sendToolResponse(
  { content, is_error }: { content: string | unknown[]; is_error?: boolean },
  clientId?: string,
) {
  if (!nativePort) return;
  if (!content || (typeof content !== "string" && !Array.isArray(content))) return;

  let response;
  if (is_error) {
    response = buildErrorToolResponse(content);
  } else {
    response = { type: "tool_response", result: { content } };
  }

  nativePort.postMessage(response);
}

function buildErrorToolResponse(content: string | unknown[]) {
  const permissionDeniedSuffix =
    "IMPORTANT: The user has explicitly declined this action. Do not attempt to use other tools or workarounds. Instead, acknowledge the denial and ask the user how they would prefer to proceed.";

  let errorContent;
  if (typeof content === "string") {
    errorContent = content.includes("Permission denied by user") ? `${content} - ${permissionDeniedSuffix}` : content;
  } else {
    errorContent = (content as Array<Record<string, unknown>>).map((item) =>
      typeof item === "object" &&
      item !== null &&
      "text" in item &&
      typeof item.text === "string" &&
      item.text.includes("Permission denied by user")
        ? { ...item, text: `${content} - ${permissionDeniedSuffix}` }
        : item,
    );
  }

  return { type: "tool_response", error: { content: errorContent } };
}

// --- Extension URL Handling ---

const CHROME_URL_PREFIX = "/chrome/";

async function handleExtensionUrl(url: string, tabId: number): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (parsed.host !== "clau.de") return false;

    if (parsed.pathname.toLowerCase() === "/chrome/permissions") {
      await (async (tid: number) => {
        try {
          const optionsUrl = chrome.runtime.getURL("options.html#permissions");
          await chrome.tabs.create({ url: optionsUrl });
        } catch (_err) {
          // ignore
        } finally {
          await closeTab(tid);
        }
      })(tabId);
      return true;
    }

    if (!parsed.pathname.startsWith(CHROME_URL_PREFIX)) return false;

    const subPath = parsed.pathname.substring(8).toLowerCase();

    if (subPath === "reconnect") {
      await (async (tid: number) => {
        try {
          await disconnectNativeHost();
          resetMcpState();
          await new Promise((r) => setTimeout(r, 500));
          const [nativeSuccess, bridgeInitiated] = await Promise.all([connectNativeHost(), connectBridge()]);
          trackEvent("superduck.extension_url.reconnect", {
            native_host_success: nativeSuccess,
            bridge_initiated: bridgeInitiated,
          });
        } catch (_err) {
          trackEvent("superduck.extension_url.reconnect", { success: false });
        } finally {
          await closeTab(tid);
        }
      })(tabId);
      return true;
    }

    if (subPath.startsWith("tab/")) {
      const targetTabId = parseInt(subPath.substring(4), 10);
      await handleTabSwitch(targetTabId, tabId);
      return true;
    }

    return false;
  } catch {
    trackEvent("superduck.extension_url.unknown_exception", {});
    return false;
  }
}

async function handleTabSwitch(targetTabId: number, callerTabId: number) {
  if (isNaN(targetTabId)) {
    trackEvent("superduck.extension_url.tab_switch", { success: false, error: "invalid_tab_id" });
    await closeTab(callerTabId);
    return true;
  }

  try {
    await tabGroupManager.initialize();
    const group = await tabGroupManager.findGroupByTab(targetTabId);

    if (!group || group.isUnmanaged) {
      trackEvent("superduck.extension_url.tab_switch", { success: false, error: "tab_not_managed" });
      await closeTab(callerTabId);
      return true;
    }

    const tab = await chrome.tabs.get(targetTabId);
    if (tab.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    await chrome.tabs.update(targetTabId, { active: true });
    trackEvent("superduck.extension_url.tab_switch", { success: true });
    await closeTab(callerTabId);
    return true;
  } catch (_err) {
    trackEvent("superduck.extension_url.tab_switch", { success: false });
    await closeTab(callerTabId);
    return true;
  }
}

async function closeTab(tabId: number) {
  try {
    await chrome.tabs.remove(tabId);
  } catch (_err) {
    // ignore
  }
}

// --- User-Agent Header Rule ---

async function setupUserAgentRule() {
  const config = getConfig();
  const extensionVersion = chrome.runtime.getManifest().version;
  const userAgentValue = `superduck-browser-extension/${extensionVersion} (external) ${navigator.userAgent} `;

  const rules: chrome.declarativeNetRequest.Rule[] = [
    {
      id: 1,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        requestHeaders: [
          {
            header: "User-Agent",
            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            value: userAgentValue,
          },
        ],
      },
      condition: {
        urlFilter: `${config.apiBaseUrl}/*`,
        resourceTypes: [
          chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
          chrome.declarativeNetRequest.ResourceType.OTHER,
        ],
      },
    },
  ];

  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1], addRules: rules });
}

// --- Scheduled Alarms ---

async function restoreScheduledAlarms() {
  try {
    const prompts = (await savedPromptsService.getAllPrompts()).filter(
      (p) => p.repeatType && p.repeatType !== "none",
    );
    if (prompts.length === 0) return;

    let successCount = 0;
    let failCount = 0;

    for (const prompt of prompts) {
      try {
        await savedPromptsService.updateAlarmForPrompt(prompt);
        successCount++;
      } catch (_err) {
        failCount++;
      }
    }

    try {
      await savedPromptsService.updateNextRunTimes();
    } catch (_err) {
      // ignore
    }
  } catch (_err) {
    // ignore
  }
}

// --- Side Panel & Tab Group Management ---

// Telemetry disabled — Sentry is upstream production error tracking.
// initSentry();
connectBridge();
connectNativeHost();
initModelMappingListener();

const mainTabAckCache = new Map<number, { timestamp: number; isAlive: boolean }>();

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
      } catch (_err) {
        // ignore
      }
    }
  } else {
    try {
      await tabGroupManager.createGroup(tabId);
    } catch (_err) {
      // ignore
    }
    connectNativeHost();
  }
}

async function handleActionClick(tab: chrome.tabs.Tab) {
  const tabId = tab.id;
  if (tabId) await openSidePanel(tabId);
}

// --- Scheduled Task Execution ---

interface ScheduledTask {
  id?: string;
  name?: string;
  prompt: string;
  url?: string;
  enabled?: boolean;
  skipPermissions?: boolean;
  model?: string;
}

async function executeScheduledTask(task: ScheduledTask, runLogId: string) {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  const newWindow = await chrome.windows.create({
    url: task.url || "about:blank",
    type: "normal",
    focused: true,
  });

  if (!newWindow || !newWindow.id || !newWindow.tabs || newWindow.tabs.length === 0) {
    throw new Error("Failed to create window for scheduled task");
  }

  const firstTab = newWindow.tabs[0];
  if (!firstTab.id) throw new Error("Failed to get tab in new window for scheduled task");

  await tabGroupManager.initialize(true);
  await tabGroupManager.createGroup(firstTab.id);
  await setStorageValue(StorageKeys.TARGET_TAB_ID, firstTab.id);

  await openSidepanelWindow({ sessionId, skipPermissions: task.skipPermissions, model: task.model });

  await waitForTabAndExecute({
    tabId: firstTab.id,
    prompt: task.prompt,
    taskName: task.name,
    runLogId,
    sessionId,
    isScheduledTask: true,
  });
}

async function openSidepanelWindow(opts: { sessionId: string; skipPermissions?: boolean; model?: string }) {
  const { sessionId, skipPermissions, model } = opts;
  const url = chrome.runtime.getURL(
    `sidepanel.html?mode=window&sessionId=${sessionId}${skipPermissions ? "&skipPermissions=true" : ""}${model ? `&model=${encodeURIComponent(model)}` : ""}`,
  );

  const win = await chrome.windows.create({
    url,
    type: "popup",
    width: 500,
    height: 768,
    left: 100,
    top: 100,
    focused: true,
  });

  if (!win) throw new Error("Failed to create sidepanel window");
  return win;
}

async function waitForTabAndExecute(opts: {
  tabId: number;
  prompt: string;
  taskName?: string;
  runLogId: string;
  sessionId: string;
  isScheduledTask: boolean;
}) {
  const { tabId, prompt, taskName, runLogId, sessionId, isScheduledTask } = opts;

  return new Promise<void>((resolve, reject) => {
    const timeout = 30_000;
    const startTime = Date.now();
    let done = false;

    const poll = async () => {
      try {
        if (Date.now() - startTime > timeout) {
          return reject(new Error("Timeout waiting for tab to load for task execution"));
        }

        const tab = await chrome.tabs.get(tabId);
        if (tab.status === "complete") {
          setTimeout(() => {
            if (done) return;
            done = true;
            chrome.runtime.sendMessage(
              {
                type: "EXECUTE_TASK",
                prompt,
                taskName,
                runLogId,
                windowSessionId: sessionId,
                isScheduledTask,
              },
              () => {
                if (chrome.runtime.lastError) {
                  reject(new Error(`Failed to send prompt: ${chrome.runtime.lastError.message}`));
                } else {
                  resolve();
                }
              },
            );
          }, 3_000);
        } else {
          setTimeout(poll, 500);
        }
      } catch (err) {
        reject(err);
      }
    };

    setTimeout(poll, 1_000);
  });
}

// =============================================
// Chrome Extension Event Listeners
// =============================================

async function openOptionsForSetup(): Promise<void> {
  const optionsBaseUrl = chrome.runtime.getURL("options.html");
  const targetUrl = chrome.runtime.getURL("options.html#permissions");
  const tabs = await chrome.tabs.query({});
  const existingTab = tabs.find((t) => typeof t.url === "string" && t.url.startsWith(optionsBaseUrl));

  if (existingTab?.id) {
    await chrome.tabs.update(existingTab.id, { url: targetUrl, active: true });
    if (existingTab.windowId) {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url: targetUrl });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.storage.local.remove(["updateAvailable"]);
  // Clear legacy uninstall feedback redirect (prevents opening a web page on uninstall).
  try {
    chrome.runtime.setUninstallURL("", () => {
      // ignore chrome.runtime.lastError
    });
  } catch {
    // ignore
  }
  initializeExtensionPermissions();
  await tabGroupManager.initialize();
  await setupUserAgentRule();
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    // First run: guide users to Options to configure API endpoint/key instead of opening SuperDuck login.
    void openOptionsForSetup().catch(() => {});
  }
  connectNativeHost();
  await restoreScheduledAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
  initializeExtensionPermissions();
  await setupUserAgentRule();
  await tabGroupManager.initialize();
  connectBridge();
  connectNativeHost();
  await restoreScheduledAlarms();
});

chrome.permissions.onAdded.addListener((permissions) => {
  if (permissions.permissions?.includes("nativeMessaging")) {
    connectNativeHost();
  }
});

chrome.permissions.onRemoved.addListener((permissions) => {
  if (permissions.permissions?.includes("nativeMessaging")) {
    disconnectNativeHost();
  }
});

chrome.action.onClicked.addListener(handleActionClick);

chrome.notifications.onClicked.addListener(async (notificationId) => {
  chrome.notifications.clear(notificationId);

  const parts = notificationId.split("_");
  let tabId: number | null = null;
  if (parts.length >= 2 && parts[1] !== "unknown") {
    tabId = parseInt(parts[1], 10);
  }

  if (tabId && !isNaN(tabId)) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab && tab.windowId) {
        await chrome.windows.update(tab.windowId, { focused: true });
        await chrome.tabs.update(tabId, { active: true });
        return;
      }
    } catch {
      // Tab may no longer exist
    }
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id && activeTab.windowId) {
    await chrome.windows.update(activeTab.windowId, { focused: true });
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-side-panel") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab) handleActionClick(tab);
    });
  }
});

chrome.runtime.onUpdateAvailable.addListener((details) => {
  setStorageValue(StorageKeys.UPDATE_AVAILABLE, true);
  trackEvent("superduck.extension.update_available", {
    current_version: chrome.runtime.getManifest().version,
    new_version: details.version,
  });
});

// --- Main Message Listener ---

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only keep the message channel open for message types we actually handle.
  // Returning true for unrecognized types (e.g. PANEL_OPENED, PANEL_CLOSED)
  // causes "message channel closed" errors since sendResponse is never called.
  if (!message?.type || !HANDLED_MESSAGE_TYPES.has(message.type)) {
    return false;
  }

  (async () => {
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
      const tabId = message.tabId || sender.tab?.id;
      if (!tabId) {
        sendResponse({ success: false });
        return;
      }

      await openSidePanel(tabId);

      if (message.prompt) {
        const retryPopulateInput = async (attempt = 0) => {
          try {
            const delay = attempt === 0 ? 800 : 500;
            await new Promise((r) => setTimeout(r, delay));
            await new Promise<void>((resolve, reject) => {
              chrome.runtime.sendMessage(
                {
                  type: "POPULATE_INPUT_TEXT",
                  prompt: message.prompt,
                  permissionMode: message.permissionMode,
                  selectedModel: message.selectedModel,
                  attachments: message.attachments,
                },
                () => {
                  if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                  else resolve();
                },
              );
            });
          } catch (_err) {
            if (attempt < 5) await retryPopulateInput(attempt + 1);
          }
        };
        await retryPopulateInput();
      }

      if (message.conversationUuid) {
        const retryLoadConversation = async (attempt = 0) => {
          try {
            const delay = attempt === 0 ? 800 : 500;
            await new Promise((r) => setTimeout(r, delay));
            await new Promise<void>((resolve, reject) => {
              chrome.runtime.sendMessage(
                {
                  type: "LOAD_CONVERSATION",
                  conversationUuid: message.conversationUuid,
                },
                () => {
                  if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                  else resolve();
                },
              );
            });
          } catch (_err) {
            if (attempt < 5) await retryLoadConversation(attempt + 1);
          }
        };
        await retryLoadConversation();
      }

      sendResponse({ success: true });
      return;
    }

    if (message.type === "logout") {
      try {
        await clearAuthData();
        await tabGroupManager.clearAllGroups();
        await clearStorageData();
        sendResponse({ success: true });
      } catch (_err) {
        // ignore
      }
      return;
    }

    if (message.type === "check_native_host_status") {
      const status = await getNativeHostStatus();
      sendResponse({
        status: {
          nativeHostInstalled: status.nativeHostInstalled,
          mcpConnected: status.mcpConnected || isBridgeConnected(),
        },
      });
      return;
    }

    if (message.type === "SEND_MCP_NOTIFICATION") {
      const nativeSent = sendMcpNotification(message.method, message.params);
      const bridgeSent = sendMcpNotificationViaBridge(message.method, message.params);
      sendResponse({ success: nativeSent || bridgeSent });
      return;
    }

    if (message.type === "OPEN_OPTIONS_WITH_TASK") {
      try {
        await setStorageValue(StorageKeys.PENDING_SCHEDULED_TASK, message.task);
        const optionsUrl = chrome.runtime.getURL("options.html");
        const allTabs = await chrome.tabs.query({});
        const existingTab = allTabs.find((t) => t.url?.startsWith(optionsUrl));

        if (existingTab && existingTab.id) {
          await chrome.tabs.update(existingTab.id, {
            url: chrome.runtime.getURL("options.html#prompts"),
            active: true,
          });
          if (existingTab.windowId) {
            await chrome.windows.update(existingTab.windowId, { focused: true });
          }
        } else {
          await chrome.tabs.create({ url: chrome.runtime.getURL("options.html#prompts") });
        }
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: (err as Error).message });
      }
      return;
    }

    if (message.type === "EXECUTE_SCHEDULED_TASK") {
      try {
        const { task, runLogId } = message;
        await executeScheduledTask(task, runLogId);
        trackEvent("superduck.scheduled_task.executed", {
          task_id: task.id,
          task_name: task.name,
          success: true,
          execution_type: message.isManual ? "manual" : "automatic",
        });
        sendResponse({ success: true });
      } catch (err) {
        trackEvent("superduck.scheduled_task.executed", {
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
      let targetTabId: number | undefined;
      if (message.fromTabId === "CURRENT_TAB" && sender.tab?.id) {
        targetTabId = (await tabGroupManager.getMainTabId(sender.tab.id)) || sender.tab.id;
      } else if (typeof message.fromTabId === "number") {
        targetTabId = message.fromTabId;
      }

      if (targetTabId) {
        // 1. Immediately tell the content script to hide all visual indicators
        //    so the user regains page control without any delay.
        chrome.tabs.sendMessage(targetTabId, { type: "HIDE_AGENT_INDICATORS" }).catch(() => {});

        // Also update the group metadata so state stays consistent.
        tabGroupManager.setTabIndicatorState(targetTabId, "none").catch(() => {});

        // 2. Forward STOP_AGENT to the sidepanel to abort the running request.
        //    If no listener responds (sidepanel closed), re-open it in the
        //    background and retry. This is fire-and-forget, not blocking.
        chrome.runtime.sendMessage({ type: "STOP_AGENT", targetTabId }).catch(() => {
          // No listener – sidepanel is closed. Re-open and retry in background.
          openSidePanel(targetTabId!).then(() => {
            setTimeout(() => {
              chrome.runtime.sendMessage({ type: "STOP_AGENT", targetTabId }).catch(() => {});
            }, 1500);
          }).catch(() => {});
        });
      }
      sendResponse({ success: true });
      return;
    }

    if (message.type === "SWITCH_TO_MAIN_TAB") {
      if (!sender.tab?.id) {
        sendResponse({ success: false, error: "No sender tab" });
        return;
      }
      try {
        await tabGroupManager.initialize(true);
        const mainTabId = await tabGroupManager.getMainTabId(sender.tab.id);
        if (mainTabId) {
          await chrome.tabs.update(mainTabId, { active: true });
          const mainTab = await chrome.tabs.get(mainTabId);
          if (mainTab.windowId) {
            await chrome.windows.update(mainTab.windowId, { focused: true });
          }
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: "No main tab found" });
        }
      } catch (err) {
        sendResponse({ success: false, error: (err as Error).message });
      }
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
      await handleStaticIndicatorHeartbeat(sender, sendResponse);
      return;
    }

    if (message.type === "DISMISS_STATIC_INDICATOR_FOR_GROUP") {
      await handleDismissStaticIndicator(sender, sendResponse);
      return;
    }
  })();

  return true; // Keep message channel open for async response
});

// --- Helper functions for message handler ---

async function getNativeHostStatus(): Promise<{ nativeHostInstalled: boolean; mcpConnected: boolean }> {
  if (nativePort && nativeHostInstalled) {
    if (statusTimeout) clearTimeout(statusTimeout);
    return new Promise((resolve) => {
      statusResolve = resolve;
      nativePort!.postMessage({ type: "get_status" });
      statusTimeout = setTimeout(() => {
        statusResolve = null;
        resolve({ nativeHostInstalled, mcpConnected });
      }, 10_000);
    });
  }
  return { nativeHostInstalled, mcpConnected };
}

function sendMcpNotification(method: string, params?: Record<string, unknown>): boolean {
  if (!nativePort) return false;
  const message = { type: "notification", jsonrpc: "2.0", method, params: params || {} };
  nativePort.postMessage(message);
  return true;
}

async function ensureOffscreenDocument() {
  if (chrome.offscreen) {
    try {
      await chrome.offscreen.closeDocument();
    } catch {
      // May not exist yet
    }
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: "Play notification sounds when user is on different tab",
    });
  }
}

async function handleStaticIndicatorHeartbeat(
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: { success: boolean }) => void,
) {
  const senderTabId = sender.tab?.id;
  if (!senderTabId) {
    sendResponse({ success: false });
    return;
  }

  try {
    const senderTab = await chrome.tabs.get(senderTabId);
    const groupId = senderTab.groupId;

    if (groupId === undefined || groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
      sendResponse({ success: false });
      return;
    }

    if (await tabGroupManager.findGroupByTab(senderTabId)) {
      sendResponse({ success: true });
      return;
    }

    const groupTabs = await chrome.tabs.query({ groupId });

    const checkTab = async (index: number) => {
      if (index >= groupTabs.length) {
        sendResponse({ success: false });
        return;
      }

      const candidateTab = groupTabs[index];
      if (candidateTab.id === senderTabId || !candidateTab.id) {
        await checkTab(index + 1);
        return;
      }

      const candidateTabId = candidateTab.id;
      const now = Date.now();
      const cached = mainTabAckCache.get(candidateTabId);

      if (cached && now - cached.timestamp < 3_000) {
        if (cached.isAlive) {
          sendResponse({ success: true });
        } else {
          await checkTab(index + 1);
        }
        return;
      }

      chrome.runtime.sendMessage(
        {
          type: "MAIN_TAB_ACK_REQUEST",
          secondaryTabId: senderTabId,
          mainTabId: candidateTabId,
          timestamp: now,
        },
        async (response) => {
          const isAlive = response?.success ?? false;
          mainTabAckCache.set(candidateTabId, { timestamp: now, isAlive });
          if (isAlive) {
            sendResponse({ success: true });
          } else {
            await checkTab(index + 1);
          }
        },
      );
    };

    await checkTab(0);
  } catch (_err) {
    sendResponse({ success: false });
  }
}

async function handleDismissStaticIndicator(
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: { success: boolean }) => void,
) {
  const senderTabId = sender.tab?.id;
  if (!senderTabId) {
    sendResponse({ success: false });
    return;
  }

  try {
    const senderTab = await chrome.tabs.get(senderTabId);
    const groupId = senderTab.groupId;

    if (groupId === undefined || groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
      sendResponse({ success: false });
      return;
    }

    await tabGroupManager.initialize();
    await tabGroupManager.dismissStaticIndicatorsForGroup(groupId);
    sendResponse({ success: true });
  } catch (_err) {
    sendResponse({ success: false });
  }
}

// --- Remaining Event Listeners ---

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await tabGroupManager.handleTabClosed(tabId);
});

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId === 0) {
    await handleExtensionUrl(details.url, details.tabId);
  }
});

// --- Alarm Handler (Scheduled Tasks) ---

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith("prompt_")) {
    try {
      const promptId = alarm.name;
      const storage = await chrome.storage.local.get(["savedPrompts"]);
      const savedPrompt = ((storage.savedPrompts || []) as Array<Record<string, unknown>>).find(
        (p) => p.id === promptId,
      );

      if (savedPrompt) {
        const runLogId = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        let executionError: Error | null = null;

        try {
          const task: ScheduledTask = {
            id: savedPrompt.id as string,
            name: (savedPrompt.command as string) || "Scheduled Task",
            prompt: savedPrompt.prompt as string,
            url: savedPrompt.url as string | undefined,
            enabled: true,
            skipPermissions: savedPrompt.skipPermissions !== false,
            model: savedPrompt.model as string | undefined,
          };
          await executeScheduledTask(task, runLogId);
        } catch (err) {
          executionError = err instanceof Error ? err : new Error(String(err));
          try {
            await chrome.notifications.create({
              type: "basic",
              iconUrl: "/icon-128.png",
              title: "Scheduled Task Failed",
              message: `Task "${savedPrompt.command || "Scheduled Task"}" failed to execute. ${executionError.message}`,
              priority: 2,
            });
          } catch (_err) {
            // ignore
          }
        }

        // Reschedule monthly/annually tasks
        if (savedPrompt.repeatType === "monthly" || savedPrompt.repeatType === "annually") {
          try {
            const { SavedPromptsService } = await import("./SavedPromptsService").then((m) => m.E);
            await SavedPromptsService.updateAlarmForPrompt(savedPrompt as any);
          } catch (_err) {
            const retryAlarmName = `retry_${promptId}`;
            try {
              await chrome.alarms.create(retryAlarmName, { delayInMinutes: 1 });
            } catch (_e) {
              // ignore
            }
            try {
              await chrome.notifications.create({
                type: "basic",
                iconUrl: "/icon-128.png",
                title: "Scheduled Task Setup Failed",
                message: `Failed to schedule next occurrence of "${savedPrompt.command || "Scheduled Task"}". Please check the task settings.`,
                priority: 2,
              });
            } catch (_e) {
              // ignore
            }
          }
        }
      }
    } catch (_err) {
      // ignore
    }
  } else if (alarm.name.startsWith("retry_")) {
    try {
      const promptId = alarm.name.replace("retry_", "");
      const storage = await chrome.storage.local.get(["savedPrompts"]);
      const savedPrompt = ((storage.savedPrompts || []) as Array<Record<string, unknown>>).find(
        (p) => p.id === promptId,
      );

      if (savedPrompt && (savedPrompt.repeatType === "monthly" || savedPrompt.repeatType === "annually")) {
        try {
          const { SavedPromptsService } = await import("./SavedPromptsService").then((m) => m.E);
          await SavedPromptsService.updateAlarmForPrompt(savedPrompt as any);
        } catch (_err) {
          try {
            await chrome.notifications.create({
              type: "basic",
              iconUrl: "/icon-128.png",
              title: "Scheduled Task Needs Attention",
              message: `Could not automatically reschedule "${savedPrompt.command || "Scheduled Task"}". Please edit the task to reschedule it.`,
              priority: 2,
            });
          } catch (_e) {
            // ignore
          }
        }
      }
    } catch (_err) {
      // ignore
    }
  }
});

// --- External Message Listener ---

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  (async () => {
    const origin = sender.origin;
    const allowedOrigins = ["https://open.bigmodel.cn", "https://coding.dashscope.aliyuncs.com"];
    if (!origin || !allowedOrigins.includes(origin)) {
      sendResponse({ success: false, error: "Untrusted origin" });
      return;
    }

    if (message.type === "oauth_redirect") {
      const result = await handleOAuthRedirect(message.redirect_uri, sender?.tab?.id);
      sendResponse(result);
      if (result.success) {
        syncPermissions().then(() => connectBridge());
        connectNativeHost();
      }
    } else if (message.type === "ping") {
      sendResponse({ success: true, exists: true });
    } else if (message.type === "onboarding_task") {
      chrome.runtime.sendMessage({
        type: "POPULATE_INPUT_TEXT",
        prompt: message.payload?.prompt,
      });
      sendResponse({ success: true });
    }
  })();

  return true;
});
