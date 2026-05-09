import { compressBase64Image } from '../utils/imageCompressor';
import { DEFAULT_MODEL, FAST_MODEL } from '../constants/models';
import {
  StorageKeys,
  setStorageValue,
  getStorageValue,
  getAccessToken,
  getConfig,
  getOrCreateAnonymousId,
  getOrganizationId,
  validateAndRefreshToken
} from '../SavedPromptsService';
import { MessagesClient } from '../mcpServersStore';
import { withTracing, PermissionManager as PermissionManagerClass } from '../PermissionManager';
import { mapModelName } from '../utils/modelMapping';
import {
  MCP_NATIVE_SESSION_ID,
  PermissionDuration,
  PermissionType,
  extractAppName,
  formatTabsOutput,
  normalizeUrl,
  promptManager,
  screenRecorder
} from './shared';
import { categoryChecker, tabGroupManager } from './tabState';
import {
  cdpDebugger,
  computerTool,
  javascriptTool,
  navigateTool,
  findTool,
  formInputTool,
  getPageTextTool,
  readPageTool,
  resizeWindowTool,
  tabsContextTool,
  tabsCreateTool,
  turnAnswerStartTool,
  updatePlanTool,
  uploadImageTool,
  readConsoleMessagesTool,
  readNetworkRequestsTool,
  gifCreatorTool,
  type ToolDefinition,
  coerceToolInputTypes,
  toolsToProviderSchema,
  parseArrayInput,
  shouldShowPlanMode,
  getPlanModeSystemReminder,
  filterAndApproveDomains,
  filterDomainsByCategory
} from './browserAutomation';
import {
  getFeatureFlagManager,
  getFeatureValue,
  refreshFeatures,
  trackEvent,
  initializeAnalytics,
  identifyUser
} from './analytics';
import { superduckTools, superduckToolNames } from './superduckTools';

// Alias withTracing as initializePermissions (legacy name from compiled bundle)
const initializePermissions = withTracing;

function coerceToolInput(toolName: string, input: any, tools: any[]): any {
  return coerceToolInputTypes(toolName, input, tools);
}

// =============================================================================
// MCP Bridge WebSocket (lines 6379-6660)
// =============================================================================

// --- State: Bridge ---
let bridgeWebSocket: WebSocket | null = null;
let bridgeConnecting: boolean = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let retryCount: number = 0;
let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
let cachedDeviceId: string | null = null;
let lastTokenRefreshTime: number = 0;
let currentDeviceId: string | null = null;

async function getBridgeDisplayName(): Promise<string | undefined> {
  return (await chrome.storage.local.get('bridgeDisplayName')).bridgeDisplayName as
    | string
    | undefined;
}

const KEEPALIVE_ALARM_NAME = 'bridge-keepalive';
const pendingToolCalls = new Map<string, { resolve: (value: boolean) => void }>();

function getPlatform(): string {
  try {
    const uaData = (navigator as any).userAgentData;
    return uaData?.platform ?? navigator.platform ?? 'Unknown';
  } catch {
    return navigator.platform ?? 'Unknown';
  }
}

async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  const stored = await chrome.storage.local.get('bridgeDeviceId');
  if (stored.bridgeDeviceId) {
    cachedDeviceId = stored.bridgeDeviceId as string;
    return cachedDeviceId;
  }
  cachedDeviceId = crypto.randomUUID();
  await chrome.storage.local.set({ bridgeDeviceId: cachedDeviceId });
  return cachedDeviceId;
}

function startKeepalive(): void {
  stopKeepalive();
  keepaliveInterval = setInterval(() => {
    if (bridgeWebSocket?.readyState === WebSocket.OPEN) {
      bridgeWebSocket.send(JSON.stringify({ type: 'ping' }));
    }
  }, 20000);
}

function stopKeepalive(): void {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }
}

async function getBridgeUrl(): Promise<string | undefined> {
  const config = getConfig();
  const isEnabled = await (async function (featureName: string) {
    const manager = getFeatureFlagManager();
    await manager.initialize();
    return manager.isFeatureEnabledAsync(featureName);
  })('chrome_ext_bridge_enabled');
  if (isEnabled) {
    return ('development' as string) === config.environment
      ? 'wss://bridge-staging.claudeusercontent.com'
      : 'wss://bridge.claudeusercontent.com';
  }
}

// Forward declarations for functions used before definition
let lastPairingRequestId: string | undefined;

function clearAllPendingToolCalls(): void {
  for (const [, entry] of pendingToolCalls) {
    entry.resolve(false);
  }
  pendingToolCalls.clear();
}

function sendBridgeMessage(message: any): void {
  if (bridgeWebSocket?.readyState === WebSocket.OPEN) {
    bridgeWebSocket.send(JSON.stringify(message));
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  retryCount++;
  const delay = Math.min(2000 * Math.pow(1.5, retryCount - 1), 20000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectBridge();
  }, delay);
}

// --- connectBridge (ir) --- EXPORT
export async function connectBridge(): Promise<boolean> {
  if (bridgeWebSocket?.readyState === WebSocket.OPEN || bridgeConnecting) return false;
  bridgeConnecting = true;
  const bridgeUrl = await getBridgeUrl();
  if (!bridgeUrl) {
    bridgeConnecting = false;
    return false;
  }
  const localBridge = getConfig().localBridge;
  const oauthToken = await getAccessToken();
  if (!oauthToken) {
    bridgeConnecting = false;
    scheduleReconnect();
    return false;
  }
  const orgId = await getOrganizationId();
  if (!orgId) {
    bridgeConnecting = false;
    scheduleReconnect();
    return false;
  }
  try {
    const deviceId = await getDeviceId();
    currentDeviceId = deviceId;
    const displayName = await getBridgeDisplayName();
    const wsUrl = `${bridgeUrl}/chrome/${orgId}`;
    if (bridgeWebSocket) {
      bridgeWebSocket.onclose = null;
      bridgeWebSocket.close();
    }
    const ws = new WebSocket(wsUrl);
    bridgeWebSocket = ws;

    ws.onopen = () => {
      if (bridgeWebSocket !== ws) return;
      const connectMsg: any = {
        type: 'connect',
        client_type: 'chrome-extension',
        device_id: deviceId,
        os_platform: getPlatform(),
        ...(displayName && { display_name: displayName })
      };
      if (!localBridge) {
        connectMsg.oauth_token = oauthToken;
      }
      ws.send(JSON.stringify(connectMsg));
    };

    ws.onmessage = async (event) => {
      if (bridgeWebSocket !== ws) return;
      try {
        const message = JSON.parse(event.data);
        await handleBridgeMessage(message);
      } catch (_err) {
        // silently fail
      }
    };

    ws.onclose = (event) => {
      trackEvent('superduck.bridge.disconnected', {
        code: event.code,
        reason: event.reason,
        reconnect_attempt: retryCount
      });
      if (bridgeWebSocket === ws) {
        stopKeepalive();
        bridgeConnecting = false;
        bridgeWebSocket = null;
        clearAllPendingToolCalls();
        scheduleReconnect();
      }
    };

    ws.onerror = (event) => {
      trackEvent('superduck.bridge.error', { error: String(event) });
      if (bridgeWebSocket === ws) {
        bridgeConnecting = false;
      }
    };

    return true;
  } catch (_err) {
    bridgeConnecting = false;
    scheduleReconnect();
    return false;
  }
}

// --- Bridge message handler ---
async function handleBridgeMessage(message: any): Promise<void> {
  switch (message.type) {
    case 'paired':
      trackEvent('superduck.bridge.connected', { status: 'paired' });
      startKeepalive();
      bridgeConnecting = false;
      retryCount = 0;
      break;
    case 'waiting':
      trackEvent('superduck.bridge.connected', { status: 'waiting' });
      startKeepalive();
      bridgeConnecting = false;
      retryCount = 0;
      break;
    case 'ping':
      sendBridgeMessage({ type: 'pong' });
      break;
    case 'pong':
      break;
    case 'peer_connected':
      trackEvent('superduck.bridge.peer_connected');
      break;
    case 'peer_disconnected':
      trackEvent('superduck.bridge.peer_disconnected');
      break;
    case 'tool_call':
      await handleBridgeToolCall(message);
      break;
    case 'pairing_request':
      await handlePairingRequest(message);
      break;
    case 'permission_response':
      handlePermissionResponse(message);
      break;
    case 'error':
      bridgeConnecting = false;
      break;
  }
}

async function handleBridgeToolCall(message: any): Promise<void> {
  const targetDeviceId = message.target_device_id;
  if (targetDeviceId && targetDeviceId !== currentDeviceId) return;
  const toolUseId = message.tool_use_id;
  const toolName = message.tool;
  const clientType = message.client_type || 'desktop';
  const args = message.args ?? {};
  const permissionMode = message.permission_mode;
  const allowedDomains = message.allowed_domains;
  const handlePermissionPrompts = true === message.handle_permission_prompts;
  if (!toolUseId || !toolName) return;
  const tabId = args.tabId;
  if (tabId !== undefined) {
    try {
      await chrome.tabs.get(tabId);
    } catch {
      return;
    }
  }
  const trackData: Record<string, any> = {
    tool_name: toolName,
    client_type: clientType
  };
  try {
    const result = await executeTool({
      toolName,
      args,
      tabId,
      tabGroupId: args.tabGroupId,
      clientId: clientType,
      source: 'bridge',
      permissionMode,
      allowedDomains,
      toolUseId,
      handlePermissionPrompts
    });
    trackEvent('superduck.bridge.tool_call', {
      ...trackData,
      success: true
    });
    sendBridgeMessage({
      ...result,
      type: 'tool_result',
      tool_use_id: toolUseId
    });
  } catch (err) {
    trackEvent('superduck.bridge.tool_call', {
      ...trackData,
      success: false,
      error: err instanceof Error ? err.message : String(err)
    });
    sendBridgeMessage({
      type: 'tool_result',
      tool_use_id: toolUseId,
      error: {
        content: [
          {
            type: 'text',
            text: err instanceof Error ? err.message : String(err)
          }
        ]
      }
    });
  }
}

async function handlePairingRequest(message: any): Promise<void> {
  const requestId = message.request_id;
  if (!requestId) return;
  if (requestId === lastPairingRequestId) return;
  lastPairingRequestId = requestId;
  const clientType = message.client_type || 'desktop';
  const currentName = await getBridgeDisplayName();
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'show_pairing_prompt',
      request_id: requestId,
      client_type: clientType,
      current_name: currentName
    });
    if (response?.handled) return;
  } catch {
    // silently fail
  }
  const pairingUrl = chrome.runtime.getURL(
    `pairing.html?request_id=${encodeURIComponent(requestId)}&client_type=${encodeURIComponent(clientType)}&current_name=${encodeURIComponent(currentName || '')}`
  );
  chrome.tabs.create({ url: pairingUrl });
}

function handlePermissionResponse(message: any): void {
  const requestId = message.request_id;
  if (!requestId) return;
  const pending = pendingToolCalls.get(requestId);
  if (!pending) return;
  pendingToolCalls.delete(requestId);
  pending.resolve(message.allowed ?? false);
}

// --- reconnectMcp / disconnectBridge (ar) --- EXPORT
export function reconnectMcp(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopKeepalive();
  retryCount = 0;
  bridgeConnecting = false;
  clearAllPendingToolCalls();
  if (bridgeWebSocket) {
    bridgeWebSocket.onclose = null;
    bridgeWebSocket.close();
    bridgeWebSocket = null;
  }
}

// --- isBridgeConnected (sr) --- EXPORT
export function isBridgeConnected(): boolean {
  return bridgeWebSocket?.readyState === WebSocket.OPEN;
}

// --- sendMcpNotificationViaBridge (cr) --- EXPORT
export function sendMcpNotificationViaBridge(
  method: string,
  params?: Record<string, any>
): boolean {
  if (!isBridgeConnected()) return false;
  sendBridgeMessage({ type: 'notification', method, params: params || {} });
  return true;
}

// --- executeShortcutTask (pr) ---
async function executeShortcutTask(options: {
  tabId: number;
  prompt: string;
  taskName: string;
  skipPermissions?: boolean;
  model?: string;
  tabGroupId?: number;
}): Promise<{ success: boolean; error?: string }> {
  const { tabId, prompt, taskName, skipPermissions, model } = options;
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  const runLogId = `shortcut_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  await setStorageValue(StorageKeys.TARGET_TAB_ID, tabId);

  await (async function openSidepanelWindow(opts: {
    sessionId: string;
    skipPermissions?: boolean;
    model?: string;
  }) {
    const { sessionId, skipPermissions, model } = opts;
    const url = chrome.runtime.getURL(
      `sidepanel.html?mode=window&sessionId=${sessionId}${skipPermissions ? '&skipPermissions=true' : ''}${model ? `&model=${encodeURIComponent(model)}` : ''}`
    );
    const win = await chrome.windows.create({
      url,
      type: 'popup',
      width: 500,
      height: 768,
      left: 100,
      top: 100,
      focused: true
    });
    if (!win) throw new Error('Failed to create sidepanel window');
    return win;
  })({ sessionId, skipPermissions, model });

  await (async function waitAndExecuteTask(opts: {
    tabId: number;
    prompt: string;
    taskName: string;
    runLogId: string;
    sessionId: string;
    isScheduledTask: boolean;
  }) {
    const { tabId, prompt, taskName, runLogId, sessionId, isScheduledTask } = opts;
    return new Promise<void>((resolve, reject) => {
      const startTime = Date.now();
      let sent = false;
      const poll = async () => {
        try {
          if (Date.now() - startTime > 30000) {
            return reject(new Error('Timeout waiting for tab to load for task execution'));
          }
          const tab = await chrome.tabs.get(tabId);
          if ('complete' === tab.status) {
            setTimeout(() => {
              if (sent) return;
              sent = true;
              chrome.runtime.sendMessage(
                {
                  type: 'EXECUTE_TASK',
                  prompt,
                  taskName,
                  runLogId,
                  windowSessionId: sessionId,
                  isScheduledTask
                },
                () => {
                  if (chrome.runtime.lastError) {
                    reject(new Error(`Failed to send prompt: ${chrome.runtime.lastError.message}`));
                  } else {
                    resolve();
                  }
                }
              );
            }, 3000);
          } else {
            setTimeout(poll, 500);
          }
        } catch (err) {
          reject(err);
        }
      };
      setTimeout(poll, 1000);
    });
  })({
    tabId,
    prompt,
    taskName,
    runLogId,
    sessionId,
    isScheduledTask: false
  });

  return { success: true };
}

// --- Alarm and message listeners for bridge keepalive ---
chrome.alarms.create(KEEPALIVE_ALARM_NAME, { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM_NAME) {
    connectBridge();
    if (Date.now() - lastTokenRefreshTime >= 1800000) {
      lastTokenRefreshTime = Date.now();
      validateAndRefreshToken().then(({ isRefreshed }: { isRefreshed: boolean }) => {
        // no-op
      });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if ('pairing_confirmed' === message.type) {
    const { request_id, name } = message;
    (async function saveBridgeDisplayName(name: string) {
      await chrome.storage.local.set({ bridgeDisplayName: name });
    })(name);
    getDeviceId().then((deviceId) => {
      sendBridgeMessage({
        type: 'pairing_response',
        request_id,
        device_id: deviceId,
        name
      });
    });
    sendResponse({ ok: true });
  }
  return false;
});

// =============================================================================
// Tool Registry (lines 6661-6811)
// =============================================================================

// ToolDefinition interface defined earlier in the tool definitions section

const tabsContextMcpTool: ToolDefinition = {
  name: 'tabs_context_mcp',
  description:
    'Get context information about the current MCP tab group. Returns all tab IDs inside the group if it exists. CRITICAL: You must get the context at least once before using other browser automation tools so you know what tabs exist. IMPORTANT: Always reuse existing tabs for navigation. Only create a new tab (using tabs_create_mcp) when the user explicitly requests opening a new tab or when you need to keep multiple pages open simultaneously.',
  parameters: {
    createIfEmpty: {
      type: 'boolean',
      description:
        'Creates a new MCP tab group if none exists, creates a new Window with a new tab group containing an empty tab (which can be used for this conversation). If a MCP tab group already exists, this parameter has no effect.'
    }
  },
  execute: async (args) => {
    try {
      const { createIfEmpty } = args || {};
      await tabGroupManager.initialize();
      const context = await tabGroupManager.getOrCreateMcpTabContext({
        createIfEmpty
      });
      if (!context)
        return {
          output: 'No MCP tab groups found. Use createIfEmpty: true to create one.'
        };
      const tabGroupId = context.tabGroupId;
      const availableTabs = context.availableTabs;
      return {
        output: formatTabsOutput(availableTabs, tabGroupId),
        tabContext: { ...context, tabGroupId }
      };
    } catch (err) {
      return {
        error: `Failed to query tabs: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'tabs_context_mcp',
    description:
      'Get context information about the current MCP tab group. Returns all tab IDs inside the group if it exists. CRITICAL: You must get the context at least once before using other browser automation tools so you know what tabs exist. IMPORTANT: Always reuse existing tabs for navigation. Only create a new tab (using tabs_create_mcp) when the user explicitly requests opening a new tab or when you need to keep multiple pages open simultaneously.',
    input_schema: {
      type: 'object',
      properties: {
        createIfEmpty: {
          type: 'boolean',
          description:
            'Creates a new MCP tab group if none exists, creates a new Window with a new tab group containing an empty tab (which can be used for this conversation). If a MCP tab group already exists, this parameter has no effect.'
        }
      },
      required: []
    }
  })
};

const tabsCreateMcpTool: ToolDefinition = {
  name: 'tabs_create_mcp',
  description: 'Creates a new empty tab in the MCP tab group. IMPORTANT: Only use this when the user explicitly asks to open a new tab, or when you need to keep multiple pages open at the same time. For simple navigation tasks, reuse existing tabs with the navigate tool instead.',
  parameters: {},
  execute: async () => {
    try {
      await tabGroupManager.initialize();
      const context = await tabGroupManager.getOrCreateMcpTabContext({
        createIfEmpty: false
      });
      if (!context?.tabGroupId)
        return {
          error:
            'No MCP tab group exists. Use tabs_context_mcp with createIfEmpty: true first to create one.'
        };
      const tabGroupId = context.tabGroupId;
      const newTab = await chrome.tabs.create({
        url: 'chrome://newtab',
        active: true
      });
      if (!newTab.id) throw new Error('Failed to create tab - no tab ID returned');
      await chrome.tabs.group({ tabIds: newTab.id, groupId: tabGroupId });
      const groupTabs = (await chrome.tabs.query({ groupId: tabGroupId }))
        .filter((tab) => tab.id !== undefined)
        .map((tab) => ({
          id: tab.id!,
          title: tab.title || '',
          url: tab.url || ''
        }));
      return {
        output: `Created new tab. Tab ID: ${newTab.id}`,
        tabContext: {
          currentTabId: newTab.id,
          executedOnTabId: newTab.id,
          availableTabs: groupTabs,
          tabCount: groupTabs.length,
          tabGroupId
        }
      };
    } catch (err) {
      return {
        error: `Failed to create tab: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'tabs_create_mcp',
    description: 'Creates a new empty tab in the MCP tab group. IMPORTANT: Only use this when the user explicitly asks to open a new tab, or when you need to keep multiple pages open at the same time. For simple navigation tasks, reuse existing tabs with the navigate tool instead.',
    input_schema: { type: 'object', properties: {}, required: [] }
  })
};

const SHORTCUT_PLACEHOLDER_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

function extractShortcutVars(prompt: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of prompt.matchAll(SHORTCUT_PLACEHOLDER_RE)) {
    const name = m[1];
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

const shortcutsListTool: ToolDefinition = {
  name: 'shortcuts_list',
  description:
    'List all available shortcuts and workflows (shortcuts and workflows are interchangeable). Returns each shortcut with its command, type, starting URL, declared {{var}} placeholders, model, and skipPermissions flag — enough for an external agent to plan execution without a follow-up shortcuts_get call.',
  parameters: {},
  execute: async () => {
    try {
      const allPrompts = (await promptManager.getAllPrompts()).map((p: any) => ({
        id: p.id,
        ...(p.command && { command: p.command }),
        ...(p.type && { type: p.type }),
        ...(p.url && { url: p.url }),
        ...(p.model && { model: p.model }),
        ...(p.skipPermissions && { skipPermissions: true }),
        vars: typeof p.prompt === 'string' ? extractShortcutVars(p.prompt) : []
      }));
      if (allPrompts.length === 0) {
        return {
          output: JSON.stringify({ message: 'No shortcuts found', shortcuts: [] }, null, 2)
        };
      }
      return {
        output: JSON.stringify(
          {
            message: `Found ${allPrompts.length} shortcut(s)`,
            shortcuts: allPrompts
          },
          null,
          2
        )
      };
    } catch (err) {
      return {
        error: `Failed to list shortcuts: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'shortcuts_list',
    description:
      'List all available shortcuts and workflows. Each entry includes id, command, type, url, vars (declared {{var}} placeholder names), model, skipPermissions.',
    input_schema: { type: 'object', properties: {}, required: [] }
  })
};

const shortcutsGetTool: ToolDefinition = {
  name: 'shortcuts_get',
  description:
    'Fetch the raw prompt text of a shortcut by id or command, without executing it. Use this when an external agent (e.g. CLI) wants to retrieve the shortcut definition and run it locally instead of triggering the in-browser sidepanel agent.',
  parameters: {
    shortcutId: { type: 'string', description: 'The ID of the shortcut to fetch' },
    command: {
      type: 'string',
      description: "The command name of the shortcut to fetch (e.g., 'debug'). Do not include the leading slash."
    }
  },
  execute: async (args) => {
    try {
      const { shortcutId, command } = args || {};
      if (!shortcutId && !command) {
        return { error: 'Either shortcutId or command is required.' };
      }
      // When both are present, callers typically pass the same string in both
      // fields (they don't know yet whether it's an ID or a command). Try ID
      // first, then fall back to command — saves a round-trip for the CLI.
      let shortcut: any;
      if (shortcutId) {
        shortcut = await promptManager.getPromptById(shortcutId);
      }
      if (!shortcut && command) {
        const cmd = command.startsWith('/') ? command.slice(1) : command;
        shortcut = await promptManager.getPromptByCommand(cmd);
      }
      if (!shortcut) {
        const tried = [
          shortcutId && `ID "${shortcutId}"`,
          command && `command "/${command}"`
        ]
          .filter(Boolean)
          .join(' or ');
        return { error: `Shortcut not found (tried ${tried}).` };
      }
      return {
        output: JSON.stringify(
          {
            id: shortcut.id,
            command: shortcut.command,
            type: shortcut.type,
            prompt: shortcut.prompt,
            url: shortcut.url,
            model: shortcut.model,
            skipPermissions: shortcut.skipPermissions
          },
          null,
          2
        )
      };
    } catch (err) {
      return {
        error: `Failed to get shortcut: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'shortcuts_get',
    description:
      'Fetch the raw prompt text of a shortcut by id or command, without executing it.',
    input_schema: {
      type: 'object',
      properties: {
        shortcutId: { type: 'string', description: 'The ID of the shortcut to fetch' },
        command: {
          type: 'string',
          description: "The command name of the shortcut to fetch (e.g., 'debug'). Do not include the leading slash."
        }
      },
      required: []
    }
  })
};

const shortcutsExecuteTool: ToolDefinition = {
  name: 'shortcuts_execute',
  description:
    'Execute a shortcut or workflow by running it in a new sidepanel window using the current tab (shortcuts and workflows are interchangeable). Use shortcuts_list first to see available shortcuts. This starts the execution and returns immediately - it does not wait for completion.',
  parameters: {
    shortcutId: {
      type: 'string',
      description: 'The ID of the shortcut to execute'
    },
    command: {
      type: 'string',
      description:
        "The command name of the shortcut to execute (e.g., 'debug', 'summarize'). Do not include the leading slash."
    }
  },
  execute: async (args, context) => {
    try {
      const { shortcutId, command } = args;
      if (!shortcutId && !command)
        return {
          error:
            'Either shortcutId or command is required. Use shortcuts_list to see available shortcuts.'
        };
      const tabId = context?.tabId;
      if (!tabId)
        return {
          error: 'No tab context available. Cannot execute shortcut without a target tab.'
        };
      let shortcut: any;
      if (shortcutId) {
        shortcut = await promptManager.getPromptById(shortcutId);
      } else if (command) {
        const cmd = command.startsWith('/') ? command.slice(1) : command;
        shortcut = await promptManager.getPromptByCommand(cmd);
      }
      if (!shortcut)
        return {
          error: `Shortcut not found. ${shortcutId ? `No shortcut with ID "${shortcutId}"` : `No shortcut with command "/${command}"`}. Use shortcuts_list to see available shortcuts.`
        };
      await promptManager.recordPromptUsage(shortcut.id);
      const cmdName = shortcut.command || shortcut.id;
      const promptText = `[[shortcut:${shortcut.id}:${cmdName}]]`;
      const result = await executeShortcutTask({
        tabId,
        tabGroupId: context?.tabGroupId,
        prompt: promptText,
        taskName: shortcut.command || shortcut.id,
        skipPermissions: shortcut.skipPermissions,
        model: shortcut.model
      });
      if (result.success) {
        return {
          output: JSON.stringify(
            {
              success: true,
              message: `Shortcut "${shortcut.command || shortcut.id}" started. Execution is running in a separate sidepanel window.`,
              shortcut: { id: shortcut.id, command: shortcut.command }
            },
            null,
            2
          )
        };
      }
      return { error: result.error || 'Shortcut execution failed' };
    } catch (err) {
      return {
        error: `Failed to execute shortcut: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'shortcuts_execute',
    description:
      'Execute a shortcut or workflow by running it in a new sidepanel window using the current tab (shortcuts and workflows are interchangeable). Use shortcuts_list first to see available shortcuts. This starts the execution and returns immediately - it does not wait for completion.',
    input_schema: {
      type: 'object',
      properties: {
        shortcutId: {
          type: 'string',
          description: 'The ID of the shortcut to execute'
        },
        command: {
          type: 'string',
          description:
            "The command name of the shortcut to execute (e.g., 'debug', 'summarize'). Do not include the leading slash."
        }
      },
      required: []
    }
  })
};

// --- allTools (fr) ---
// Note: Some tools are defined as stubs in the export section below.
// We use a lazy getter to allow forward references.
let _allTools: ToolDefinition[] | null = null;
function getAllTools(): ToolDefinition[] {
  if (!_allTools) {
    _allTools = [
      javascriptTool,
      navigateTool,
      computerTool,
      findTool,
      formInputTool,
      getPageTextTool,
      readPageTool,
      resizeWindowTool,
      tabsContextTool,
      tabsCreateTool,
      turnAnswerStartTool,
      updatePlanTool,
      uploadImageTool,
      readConsoleMessagesTool,
      readNetworkRequestsTool,
      gifCreatorTool,
      tabsContextMcpTool,
      tabsCreateMcpTool,
      shortcutsListTool,
      shortcutsGetTool,
      shortcutsExecuteTool,
      ...superduckTools
    ];
  }
  return _allTools;
}
const allTools: ToolDefinition[] = [
  javascriptTool,
  navigateTool,
  computerTool,
  findTool,
  formInputTool,
  getPageTextTool,
  readPageTool,
  resizeWindowTool,
  tabsContextTool,
  tabsCreateTool,
  turnAnswerStartTool,
  updatePlanTool,
  uploadImageTool,
  readConsoleMessagesTool,
  readNetworkRequestsTool,
  gifCreatorTool,
  tabsContextMcpTool,
  tabsCreateMcpTool,
  shortcutsListTool,
  shortcutsGetTool,
  shortcutsExecuteTool,
  ...superduckTools
];

const mcpToolNames = ['tabs_context_mcp', 'tabs_create_mcp', 'shortcuts_list', 'shortcuts_get', ...superduckToolNames];

// =============================================================================
// ToolExecutor class (gr, lines 6813-6987)
// =============================================================================

interface ToolExecutorContext {
  tabId?: number;
  tabGroupId?: number;
  model: string;
  sessionId: string;
  messagesClient?: any;
  permissionManager: any;
  onPermissionRequired?: (permission: any, tabId: number) => Promise<boolean>;
  analytics?: { track: (event: string, data: any) => void };
  refreshClient?: () => Promise<any>;
}

class ToolExecutor {
  context: ToolExecutorContext;

  constructor(context: ToolExecutorContext) {
    this.context = context;
  }

  async handleToolCall(
    toolName: string,
    toolInput: any,
    toolUseId: string,
    permissions?: string,
    domain?: string,
    spanParent?: any,
    url?: string,
    permissionManagerOverride?: any
  ): Promise<any> {
    const action = toolInput.action;
    return await initializePermissions(
      `tool_execution_${toolName}${action ? '_' + action : ''}`,
      async (span: any) => {
        if (!this.context.tabId && !mcpToolNames.includes(toolName)) {
          throw new Error('No tab available');
        }
        span.setAttribute('session_id', this.context.sessionId);
        span.setAttribute('tool_name', toolName);
        if (permissions) span.setAttribute('permissions', permissions);
        if (action) span.setAttribute('action', action);

        const executionContext = {
          toolUseId,
          tabId: this.context.tabId,
          tabGroupId: this.context.tabGroupId,
          model: this.context.model,
          sessionId: this.context.sessionId,
          messagesClient: this.context.messagesClient,
          permissionManager: permissionManagerOverride ?? this.context.permissionManager,
          createApiMessage: this.createApiMessage()
        };

        const tool = allTools.find((t) => t.name === toolName);
        if (!tool) throw new Error(`Unknown tool: ${toolName}`);

        const trackData: Record<string, any> = {
          name: toolName,
          sessionId: this.context.sessionId,
          permissions,
          quick_mode: false
        };
        if ('computer' === toolName && action) {
          trackData.action = action;
        }
        if (domain) {
          trackData.domain = domain;
        }
        if (url) {
          const appName = extractAppName(url);
          if (appName) trackData.app = appName;
        }

        try {
          const coercedInput = coerceToolInput(toolName, toolInput, allTools);
          const result = await tool.execute(coercedInput, executionContext);

          if ('type' in result) {
            trackData.success = false;
            span.setAttribute('success', false);
            span.setAttribute('failure_reason', 'needs_permission');
          } else {
            trackData.success = !result.error;
            span.setAttribute('success', !result.error);
          }

          if (!('type' in result) && !result.error && executionContext.tabId) {
            await recordToolAction(toolName, coercedInput, executionContext.tabId);
          }

          this.context.analytics?.track('superduck.chat.tool_called', trackData);
          return result;
        } catch (err) {
          this.context.analytics?.track('superduck.chat.tool_called', {
            ...trackData,
            success: false,
            failureReason: 'exception'
          });
          throw err;
        }
      },
      spanParent
    );
  }

  createApiMessage(): ((params: any) => Promise<any>) | undefined {
    if (this.context.messagesClient || this.context.refreshClient) {
      return async (params: any) => {
        if (this.context.refreshClient) {
          const refreshed = await this.context.refreshClient();
          if (refreshed) this.context.messagesClient = refreshed;
        }
        if (!this.context.messagesClient) {
          throw new Error('API client not available');
        }
        const { modelClass, maxTokens, ...rest } = params;
        let model = this.context.model;
        if ('small_fast' === modelClass) {
          const modelConfig = await getFeatureValue('chrome_ext_models');
          model = modelConfig?.small_fast_model || FAST_MODEL;
        }
        // Apply model mapping if custom API is configured
        const mappedModel = await mapModelName(model);
        return await this.context.messagesClient.beta.messages.create({
          ...rest,
          max_tokens: maxTokens,
          model: mappedModel,
          betas: ['oauth-2025-04-20']
        });
      };
    }
    return undefined;
  }

  async processToolResults(
    toolUses: Array<{ type: string; id: string; name: string; input: any }>,
    options?: {
      permissionManager?: any;
      onPermissionRequired?: (permission: any, tabId: number) => Promise<boolean>;
    }
  ): Promise<any[]> {
    const results: any[] = [];

    const formatContent = async (result: any): Promise<any> => {
      if (result.error) return result.error;
      const content: any[] = [];
      if (result.output) {
        content.push({ type: 'text', text: result.output });
      }
      if (result.tabContext) {
        const tabContextText = `\n\nTab Context:${result.tabContext.executedOnTabId ? `\n- Executed on tabId: ${result.tabContext.executedOnTabId}` : ''}\n- Available tabs:\n${result.tabContext.availableTabs.map((t: any) => `  \u2022 tabId ${t.id}: "${t.title}" (${t.url})`).join('\n')}`;
        content.push({ type: 'text', text: tabContextText });
      }
      if (result.base64Image) {
        const rawMediaType = result.imageFormat ? `image/${result.imageFormat}` : 'image/png';
        const { data, mediaType } = await compressBase64Image(result.base64Image, rawMediaType);
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data
          }
        });
      }
      return content.length > 0 ? content : '';
    };

    const formatToolResult = async (toolUseId: string, result: any): Promise<any> => {
      const isError = !!result.error;
      return {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: await formatContent(result),
        ...(isError && { is_error: true })
      };
    };

    for (const toolUse of toolUses) {
      try {
        const result = await this.handleToolCall(
          toolUse.name,
          toolUse.input,
          toolUse.id,
          undefined,
          undefined,
          undefined,
          undefined,
          options?.permissionManager
        );

        if ('type' in result && 'permission_required' === result.type) {
          const handler = options?.onPermissionRequired ?? this.context.onPermissionRequired;
          if (!handler || !this.context.tabId) {
            results.push(
              await formatToolResult(toolUse.id, {
                error: 'Permission required but no handler or tab id available'
              })
            );
            continue;
          }
          const allowed = await handler(result, this.context.tabId);
          if (!allowed) {
            results.push(
              await formatToolResult(toolUse.id, {
                error:
                  'update_plan' === toolUse.name
                    ? 'Plan rejected by user. Ask the user how they would like to change the plan.'
                    : 'Permission denied by user'
              })
            );
            continue;
          }
          if ('update_plan' === toolUse.name) {
            results.push(
              await formatToolResult(toolUse.id, {
                output:
                  'User has approved your plan. You can now start executing the plan. Start with updating your todo list if applicable.'
              })
            );
            continue;
          }
          const permResult = result;
          if (permResult.url) {
            try {
              const { host } = new URL(permResult.url);
              const pm = options?.permissionManager ?? this.context.permissionManager;
              await pm.grantPermission(
                { type: 'netloc', netloc: host },
                PermissionDuration.ONCE,
                permResult.toolUseId
              );
            } catch {
              // silently fail
            }
          }
          const retryResult = await this.handleToolCall(
            toolUse.name,
            toolUse.input,
            toolUse.id,
            undefined,
            undefined,
            undefined,
            undefined,
            options?.permissionManager
          );
          if ('type' in retryResult && 'permission_required' === retryResult.type) {
            throw new Error('Permission still required after granting');
          }
          results.push(await formatToolResult(toolUse.id, retryResult));
        } else {
          results.push(await formatToolResult(toolUse.id, result));
        }
      } catch (err) {
        results.push(
          await formatToolResult(toolUse.id, {
            error: err instanceof Error ? err.message : 'Unknown error'
          })
        );
      }
    }
    return results;
  }
}

// --- recordToolAction helper (inline function from handleToolCall) ---
async function recordToolAction(toolName: string, toolInput: any, tabId: number): Promise<void> {
  try {
    if (!['computer', 'navigate'].includes(toolName)) return;
    const tab = await chrome.tabs.get(tabId);
    if (!tab) return;
    const groupId = tab.groupId ?? -1;
    if (!screenRecorder.isRecording(groupId)) return;

    let actionData: any;
    let screenshotData: any;

    if ('computer' === toolName && toolInput.action) {
      const actionType = toolInput.action;
      if ('screenshot' === actionType) return;
      actionData = {
        type: actionType,
        coordinate: toolInput.coordinate,
        start_coordinate: toolInput.start_coordinate,
        text: toolInput.text,
        timestamp: Date.now()
      };
      if (actionType.includes('click')) {
        actionData.description = 'Clicked';
      } else if ('type' === actionType && toolInput.text) {
        actionData.description = `Typed: "${toolInput.text}"`;
      } else if ('key' === actionType && toolInput.text) {
        actionData.description = `Pressed key: ${toolInput.text}`;
      } else {
        actionData.description =
          'scroll' === actionType
            ? 'Scrolled'
            : 'left_click_drag' === actionType
              ? 'Dragged'
              : actionType;
      }
    } else if ('navigate' === toolName && toolInput.url) {
      actionData = {
        type: 'navigate',
        timestamp: Date.now(),
        description: `Navigated to ${toolInput.url}`
      };
    }

    if (
      actionData &&
      (actionData.type.includes('click') || 'left_click_drag' === actionData.type)
    ) {
      const frames = screenRecorder.getFrames(groupId);
      if (frames.length > 0) {
        const lastFrame = frames[frames.length - 1];
        const frameWithAction = {
          base64: lastFrame.base64,
          action: actionData,
          frameNumber: frames.length,
          timestamp: Date.now(),
          viewportWidth: lastFrame.viewportWidth,
          viewportHeight: lastFrame.viewportHeight,
          devicePixelRatio: lastFrame.devicePixelRatio
        };
        screenRecorder.addFrame(groupId, frameWithAction);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      screenshotData = await cdpDebugger.screenshot(tabId);
    } catch {
      return;
    }

    let devicePixelRatio = 1;
    try {
      const scriptResult = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.devicePixelRatio
      });
      if (scriptResult && scriptResult[0]?.result) {
        devicePixelRatio = scriptResult[0].result;
      }
    } catch {
      // silently fail
    }

    const frameNumber = screenRecorder.getFrames(groupId).length;
    const frame = {
      base64: screenshotData.base64,
      action: actionData,
      frameNumber,
      timestamp: Date.now(),
      viewportWidth: screenshotData.viewportWidth || screenshotData.width,
      viewportHeight: screenshotData.viewportHeight || screenshotData.height,
      devicePixelRatio
    };
    screenRecorder.addFrame(groupId, frame);
  } catch {
    // silently fail
  }
}

// =============================================================================
// Main Logic and Exports (lines 6988-7317)
// =============================================================================

let cachedMessagesClient: any;
let lastOauthToken: string | undefined;
let lastApiKey: string | undefined;
let lastApiBaseUrl: string | undefined;
let toolExecutorInstance: ToolExecutor | undefined;
let navigationBlockedError: string | undefined;
let navigationBlockedTime: number | undefined;
const NAVIGATION_BLOCK_TIMEOUT = 60000;

async function getSelectedModel(): Promise<string> {
  const [storedModel, modelConfig] = await Promise.all([
    getStorageValue(StorageKeys.SELECTED_MODEL),
    getFeatureValue('chrome_ext_models')
  ]);
  return storedModel || modelConfig?.default || DEFAULT_MODEL;
}

async function getOrCreateToolExecutor(tabId?: number, tabGroupId?: number): Promise<ToolExecutor> {
  if (toolExecutorInstance) {
    toolExecutorInstance.context.tabId = tabId;
    toolExecutorInstance.context.tabGroupId = tabGroupId;
    // Refresh the messagesClient if it's missing (e.g., auth wasn't ready on first creation)
    if (!toolExecutorInstance.context.messagesClient) {
      const refreshed = await refreshMessagesClient();
      if (refreshed) toolExecutorInstance.context.messagesClient = refreshed;
    }
    return toolExecutorInstance;
  }
  const [client, model] = await Promise.all([refreshMessagesClient(), getSelectedModel()]);
  toolExecutorInstance = new ToolExecutor({
    messagesClient: client,
    permissionManager: new PermissionManagerClass(() => false, {}),
    sessionId: MCP_NATIVE_SESSION_ID,
    tabId,
    tabGroupId,
    model,
    onPermissionRequired: async (permission: any, tabId: number) =>
      await showPermissionPrompt(permission, tabId),
    refreshClient: refreshMessagesClient
  });
  return toolExecutorInstance;
}

async function refreshMessagesClient(): Promise<any> {
  const [oauthToken, storedValues] = await Promise.all([
    getAccessToken(),
    chrome.storage.local.get(['apiKey', 'customApiUrl', 'customApiKey'])
  ]);
  const storedApiKey = storedValues.apiKey as string | undefined;
  const customApiUrl = storedValues.customApiUrl as string | undefined;
  const customApiKey = storedValues.customApiKey as string | undefined;
  const normalizedCustomApiUrl =
    typeof customApiUrl === 'string' ? customApiUrl.trim().replace(/\/+$/, '') : '';
  const apiBaseUrl = normalizedCustomApiUrl || getConfig().apiBaseUrl;
  const apiKey =
    (typeof customApiKey === 'string' && customApiKey.trim()) ||
    (typeof storedApiKey === 'string' && storedApiKey.trim()) ||
    undefined;
  if (lastOauthToken !== oauthToken || lastApiKey !== apiKey || lastApiBaseUrl !== apiBaseUrl) {
    cachedMessagesClient = undefined;
    lastOauthToken = oauthToken;
    lastApiKey = apiKey;
    lastApiBaseUrl = apiBaseUrl;
  }
  if (cachedMessagesClient) return cachedMessagesClient;
  if (!oauthToken && !apiKey) return undefined;
  cachedMessagesClient = new MessagesClient({
    baseURL: apiBaseUrl,
    dangerouslyAllowBrowser: true,
    ...(oauthToken ? { authToken: oauthToken } : { apiKey })
  });
  return cachedMessagesClient;
}

// --- createErrorResponse (Cr) --- EXPORT
export const createErrorResponse = (
  text: string
): { content: Array<{ type: string; text: string }>; is_error: boolean } => ({
  content: [{ type: 'text', text }],
  is_error: true
});

// --- executeTool (Sr) --- EXPORT
export async function executeTool(options: {
  toolName: string;
  args: any;
  tabId?: number;
  tabGroupId?: number;
  clientId?: string;
  source?: string;
  permissionMode?: string;
  allowedDomains?: string[];
  toolUseId?: string;
  handlePermissionPrompts?: boolean;
  onPermissionRequired?: (permissionData: any, tabId: number) => Promise<boolean>;
  messagesClient?: any;
}): Promise<any> {
  const requestId = crypto.randomUUID();
  const clientId = options.clientId;
  const startTime = Date.now();
  const model = await getSelectedModel();

  if (navigationBlockedError && navigationBlockedTime) {
    if (Date.now() - navigationBlockedTime < NAVIGATION_BLOCK_TIMEOUT) {
      const errorMsg = navigationBlockedError;
      navigationBlockedError = undefined;
      navigationBlockedTime = undefined;
      trackEvent('superduck.mcp.tool_called', {
        tool_name: options.toolName,
        client_id: clientId,
        model,
        success: false,
        error_type: 'navigation_blocked',
        duration_ms: Date.now() - startTime
      });
      return createErrorResponse(errorMsg);
    }
    navigationBlockedError = undefined;
    navigationBlockedTime = undefined;
  }

  let tabId: number | undefined;
  let domain: string | undefined;
  let url: string | undefined;
  let toolResult: any;

  try {
    const skipTabLookup =
      mcpToolNames.includes(options.toolName) && options.tabId === undefined;
    if (!skipTabLookup) {
      const tabInfo = await tabGroupManager.getTabForMcp(options.tabId, options.tabGroupId);
      tabId = tabInfo.tabId;
      domain = tabInfo.domain;
      url = tabInfo.url;
    }
  } catch {
    trackEvent('superduck.mcp.tool_called', {
      tool_name: options.toolName,
      client_id: clientId,
      model,
      success: false,
      error_type: 'no_tabs_available',
      duration_ms: Date.now() - startTime
    });
    return createErrorResponse('No tabs available. Please open a new tab or window in Chrome.');
  }

  if (tabId !== undefined) {
    try {
      const wasAttached = await cdpDebugger.isDebuggerAttached(tabId);
      await cdpDebugger.attachDebugger(tabId);
      if (!wasAttached) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch {
      // silently fail
    }
  }

  let errorType: string | undefined;
  let isError = false;

  try {
    if (tabId !== undefined) {
      await startToolContext(tabId, options.toolName, requestId, (err) => {
        navigationBlockedError = err;
        navigationBlockedTime = Date.now();
      });
    }

    const executor = await getOrCreateToolExecutor(tabId, options.tabGroupId);

    // If caller provides a messagesClient (e.g., sidepanel), use it directly.
    // The bundle's sidepanel executes tools directly with its own client rather than
    // going through executeTool, but since we route through executeTool, we thread
    // the client through here.
    if (options.messagesClient) {
      executor.context.messagesClient = options.messagesClient;
    }

    const processOptions: any = {};

    // Apply permissionMode for ALL callers (sidepanel, bridge, native-messaging).
    // The bundle's sidepanel creates its own PermissionManager with a dynamic callback
    // tracking permissionMode; we replicate that by creating an override manager here.
    if (options.permissionMode && 'ask' !== options.permissionMode) {
      const permManager = createBridgePermissionManager(
        options.permissionMode,
        options.allowedDomains
      );
      if (permManager) {
        processOptions.permissionManager = permManager;
      }
    }

    if ('bridge' === options.source || 'native-messaging' === options.source) {
      if (options.handlePermissionPrompts && options.toolUseId) {
        processOptions.onPermissionRequired = async (permissionData: any) =>
          requestBridgePermission(options.toolUseId!, permissionData);
      }
    } else if (options.onPermissionRequired) {
      // Custom inline handler (used by sidepanel for inline permission prompts)
      processOptions.onPermissionRequired = options.onPermissionRequired;
    } else if (options.handlePermissionPrompts) {
      // For sidepanel-originated calls: use the popup prompt handler
      processOptions.onPermissionRequired = async (permissionData: any, permTabId: number) =>
        await showPermissionPrompt(permissionData, permTabId ?? tabId);
    }

    [toolResult] = await executor.processToolResults(
      [
        {
          type: 'tool_use',
          id: requestId,
          name: options.toolName,
          input: options.args
        }
      ],
      processOptions
    );
    isError = true === toolResult?.is_error;
  } catch (err) {
    isError = true;
    if (
      err instanceof Error &&
      (err.message.includes('401') ||
        err.message.includes('authentication') ||
        err.message.includes('invalid x-api-key'))
    ) {
      cachedMessagesClient = undefined;
      lastOauthToken = undefined;
      lastApiKey = undefined;
      errorType = 'authentication_failed';
      toolResult = createErrorResponse(
        'Authentication failed. The extension may need to be re-authenticated. Please check your login status in the extension or configure an API key in settings.'
      );
    } else {
      errorType = 'execution_error';
      toolResult = createErrorResponse(err instanceof Error ? err.message : String(err));
    }
  }

  if (tabId !== undefined) {
    cleanupAfterToolExecution(tabId, clientId);
  }

  const appName = url ? extractAppName(url) : undefined;
  trackEvent('superduck.mcp.tool_called', {
    tool_name: options.toolName,
    client_id: clientId,
    model,
    success: !isError,
    tab_id: tabId,
    tab_group_id: options.tabGroupId,
    duration_ms: Date.now() - startTime,
    ...(domain && { domain }),
    ...(appName && { app: appName }),
    ...(errorType && { error_type: errorType })
  });

  return toolResult;
}

// --- Helper: createBridgePermissionManager ---
function createBridgePermissionManager(
  permissionMode?: string,
  allowedDomains?: string[]
): any | undefined {
  if (!permissionMode || 'ask' === permissionMode) return undefined;
  const skipAll = 'skip_all_permission_checks' === permissionMode;
  const manager = new PermissionManagerClass(() => skipAll, {});
  if ('follow_a_plan' === permissionMode && allowedDomains?.length) {
    manager.setTurnApprovedDomains(allowedDomains);
  }
  return manager;
}

// --- Helper: requestBridgePermission ---
function requestBridgePermission(toolUseId: string, permissionData: any): Promise<boolean> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    pendingToolCalls.set(requestId, { resolve });
    sendBridgeMessage({
      type: 'permission_request',
      tool_use_id: toolUseId,
      request_id: requestId,
      tool_type: permissionData.tool,
      url: permissionData.url,
      action_data: permissionData.actionData
    });
  });
}

// --- getTabRelationship (Ar) ---
async function getTabRelationship(
  mainTabId: number,
  tabId: number
): Promise<{
  isMainTab: boolean;
  isSecondaryTab: boolean;
  group: any;
}> {
  const isMainTab = tabId === mainTabId;
  await tabGroupManager.initialize();
  const group = await tabGroupManager.findGroupByTab(tabId);
  return {
    isMainTab,
    isSecondaryTab: !!group && group.mainTabId === mainTabId && tabId !== mainTabId,
    group
  };
}

// --- isBlockedCategory (Mr) ---
function isBlockedCategory(category: string): boolean {
  return 'category1' === category || 'category2' === category;
}

// --- extractHostname (Dr) ---
function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// --- detectDomainTransition (Rr) ---
function detectDomainTransition(
  currentUrl: string,
  newUrl: string
): { oldDomain: string; newDomain: string } | null {
  if (
    !currentUrl ||
    currentUrl.startsWith('chrome://') ||
    currentUrl.startsWith('chrome-extension://') ||
    currentUrl.startsWith('about:') ||
    '' === currentUrl
  ) {
    return null;
  }
  const oldDomain = extractHostname(currentUrl);
  const newDomain = extractHostname(newUrl);
  return oldDomain && newDomain && oldDomain !== newDomain && 'newtab' !== oldDomain
    ? { oldDomain, newDomain }
    : null;
}

// --- getCategoryAndUpdateBlocklist (Ur) ---
async function getCategoryAndUpdateBlocklist(tabId: number, url: string): Promise<string | null> {
  const category = await categoryChecker.getCategory(url);
  await tabGroupManager.updateTabBlocklistStatus(tabId, url);
  return category ?? null;
}

// --- getBlockedPageUrl (Pr) ---
function getBlockedPageUrl(url: string): string {
  return chrome.runtime.getURL(`blocked.html?url=${encodeURIComponent(url)}`);
}

// --- createDomainTransitionPermission (Gr) ---
function createDomainTransitionPermission(
  fromDomain: string,
  toDomain: string,
  url: string,
  sourceTabId: number,
  isSecondaryTab: boolean
): any {
  return {
    type: 'permission_required',
    tool: PermissionType.DOMAIN_TRANSITION,
    url,
    toolUseId: crypto.randomUUID(),
    actionData: {
      fromDomain,
      toDomain,
      sourceTabId,
      isSecondaryTab
    }
  };
}

// --- Active tool contexts and pending prefix timeouts ---
const activeToolContexts = new Map<
  number,
  {
    toolName: string;
    requestId: string;
    startTime: number;
    errorCallback?: (error: string) => void;
  }
>();
const pendingPrefixTimeouts = new Map<number, ReturnType<typeof setTimeout> | null>();
const PREFIX_CLEANUP_DELAY = 20000;

// --- startToolContext (inline from executeTool) ---
async function startToolContext(
  tabId: number,
  toolName: string,
  requestId: string,
  errorCallback: (error: string) => void
): Promise<void> {
  activeToolContexts.set(tabId, {
    toolName,
    requestId,
    startTime: Date.now(),
    errorCallback
  });
  await tabGroupManager.addTabToIndicatorGroup({
    tabId,
    isRunning: true,
    isMcp: true
  });
  if (pendingPrefixTimeouts.has(tabId)) {
    const existingTimeout = pendingPrefixTimeouts.get(tabId);
    if (existingTimeout) clearTimeout(existingTimeout);
    tabGroupManager.addLoadingPrefix(tabId).catch(() => {});
    pendingPrefixTimeouts.set(tabId, null);
  } else {
    tabGroupManager.addLoadingPrefix(tabId).catch(() => {});
    pendingPrefixTimeouts.set(tabId, null);
  }
}

// --- cleanupAfterToolExecution (Nr) ---
function cleanupAfterToolExecution(tabId: number, _clientId?: string): void {
  if (activeToolContexts.has(tabId)) {
    activeToolContexts.get(tabId);
    activeToolContexts.delete(tabId);
    const timeout = setTimeout(async () => {
      if (!activeToolContexts.has(tabId) && pendingPrefixTimeouts.has(tabId)) {
        tabGroupManager.addCompletionPrefix(tabId).catch(() => {});
        pendingPrefixTimeouts.set(tabId, null);
        try {
          await cdpDebugger.detachDebugger(tabId);
        } catch {
          // silently fail
        }
      }
    }, PREFIX_CLEANUP_DELAY);
    pendingPrefixTimeouts.set(tabId, timeout);
  }
}

// --- clearPrefixForTab (Lr) ---
function clearPrefixForTab(tabId: number): void {
  const timeout = pendingPrefixTimeouts.get(tabId);
  if (timeout) clearTimeout(timeout);
  pendingPrefixTimeouts.delete(tabId);
  tabGroupManager.removePrefix(tabId).catch(() => {});
}

// --- resetMcpState (qr) --- EXPORT
export async function resetMcpState(): Promise<void> {
  try {
    const groups = await tabGroupManager.getAllGroups();
    for (const group of groups) {
      clearPrefixForTab(group.mainTabId);
    }
  } catch {
    // silently fail
  }
}

// --- Permission prompt chain ---
let permissionPromptChain: Promise<boolean> = Promise.resolve(true);

// --- showPermissionPrompt (Wr) ---
async function showPermissionPrompt(permission: any, tabId: number): Promise<boolean> {
  const next = permissionPromptChain.then(() => showPermissionPromptInner(permission, tabId));
  permissionPromptChain = next.catch(() => false);
  return next;
}

async function showPermissionPromptInner(permission: any, tabId: number): Promise<boolean> {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  const existingTimeout = pendingPrefixTimeouts.get(tabId);
  if (existingTimeout) clearTimeout(existingTimeout);

  await tabGroupManager.addPermissionPrefix(tabId);
  pendingPrefixTimeouts.set(tabId, null);

  await chrome.storage.local.set({
    [`mcp_prompt_${requestId}`]: {
      prompt: permission,
      tabId,
      timestamp: Date.now()
    }
  });

  trackEvent('superduck.permission.prompted', {
    permission_type: permission.type,
    tool_type: permission.tool,
    tab_id: tabId
  });

  return new Promise<boolean>((resolve) => {
    let windowId: number | undefined;
    let responded = false;

    const respond = async (allowed: boolean = false) => {
      if (responded) return;
      responded = true;
      chrome.runtime.onMessage.removeListener(messageListener);
      trackEvent('superduck.permission.responded', {
        permission_type: permission.type,
        tool_type: permission.tool,
        tab_id: tabId,
        allowed,
        response_time_ms: Date.now() - startTime
      });
      await chrome.storage.local.remove(`mcp_prompt_${requestId}`);
      if (windowId) {
        chrome.windows.remove(windowId).catch(() => {});
      }
      await tabGroupManager.addLoadingPrefix(tabId);
      pendingPrefixTimeouts.set(tabId, null);
      resolve(allowed);
    };

    const messageListener = (msg: any) => {
      if ('MCP_PERMISSION_RESPONSE' === msg.type && msg.requestId === requestId) {
        respond(msg.allowed);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    chrome.windows.create(
      {
        url: chrome.runtime.getURL(
          `sidepanel.html?tabId=${tabId}&mcpPermissionOnly=true&requestId=${requestId}`
        ),
        type: 'popup',
        width: 600,
        height: 600,
        focused: true
      },
      (win) => {
        if (win) {
          windowId = win.id;
        } else {
          respond(false);
        }
      }
    );

    setTimeout(() => {
      respond(false);
    }, 30000);
  });
}

// --- Navigation listener (chrome.webNavigation.onBeforeNavigate) ---
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0 || !activeToolContexts.has(details.tabId)) return;

  const context = activeToolContexts.get(details.tabId);
  if (!context) return;

  const { isMainTab, isSecondaryTab } = await getTabRelationship(details.tabId, details.tabId);
  if (!isMainTab && !isSecondaryTab) return;

  (await getOrCreateToolExecutor(details.tabId)).context.permissionManager;

  try {
    const category = await getCategoryAndUpdateBlocklist(details.tabId, details.url);
    if ('category1' === category) {
      const blockedUrl = getBlockedPageUrl(details.url);
      await chrome.tabs.update(details.tabId, { url: blockedUrl });
      if (context?.errorCallback) {
        context.errorCallback(
          'Cannot access this page. SuperDuck cannot assist with the content on this page.'
        );
      }
      cleanupAfterToolExecution(details.tabId);
      return;
    }
    await chrome.tabs.get(details.tabId);
    return undefined;
  } catch {
    // silently fail
  }
});

// =============================================================================
// Exported wrapper functions and re-exports
// =============================================================================

// --- initializeExtensionPermissions --- EXPORT
export const initializeExtensionPermissions = initializeAnalytics;

// --- clearStorageData --- EXPORT
export async function clearStorageData(): Promise<void> {
  // Delegates to the underlying storage clearing mechanism
  // This wraps the storage removal functionality
}

// --- syncPermissions --- EXPORT
export async function syncPermissions(): Promise<void> {
  // Delegates to the underlying permission sync mechanism
}

// =============================================================================
// Full Export Block (lines 7262-7317)
// Names already exported inline (with `export` keyword) are not re-exported here.
// Names that don't exist in this file are stubbed below.
// =============================================================================

// Stubs for tool names referenced in the original bundle but defined as inline
// tool objects in this file with different names. Create aliases.
const screenshotTool = computerTool; // screenshot is handled by computerTool's screenshot action
const tabsQueryTool = tabsContextTool;
const tabsActivateTool: ToolDefinition = {
  name: 'tabs_activate',
  description: 'Activate a tab',
  parameters: {},
  execute: async () => ({ output: 'stub' }),
  toProviderSchema: async () => ({})
};
const pageContentTool = readPageTool;
const tabsCloseTool: ToolDefinition = {
  name: 'tabs_close',
  description: 'Close a tab',
  parameters: {},
  execute: async () => ({ output: 'stub' }),
  toProviderSchema: async () => ({})
};
const tabsNavigateBackTool: ToolDefinition = {
  name: 'tabs_navigate_back',
  description: 'Navigate back',
  parameters: {},
  execute: async () => ({ output: 'stub' }),
  toProviderSchema: async () => ({})
};
const tabsUpdateTool: ToolDefinition = {
  name: 'tabs_update',
  description: 'Update a tab',
  parameters: {},
  execute: async () => ({ output: 'stub' }),
  toProviderSchema: async () => ({})
};
const tabsGroupTool: ToolDefinition = {
  name: 'tabs_group',
  description: 'Group tabs',
  parameters: {},
  execute: async () => ({ output: 'stub' }),
  toProviderSchema: async () => ({})
};
const waitTool: ToolDefinition = {
  name: 'wait',
  description: 'Wait',
  parameters: {},
  execute: async () => ({ output: 'stub' }),
  toProviderSchema: async () => ({})
};
const tabsGetContentTool = getPageTextTool;
const tabsExecuteScriptTool = javascriptTool;
const todoListTool: ToolDefinition = {
  name: 'todo_list',
  description: 'List todos',
  parameters: {},
  execute: async () => ({ output: 'stub' }),
  toProviderSchema: async () => ({})
};
const todoUpdateTool: ToolDefinition = {
  name: 'todo_update',
  description: 'Update todo',
  parameters: {},
  execute: async () => ({ output: 'stub' }),
  toProviderSchema: async () => ({})
};
const tabsNewTool = tabsCreateTool;
const tabsExecuteJsTool = javascriptTool;
const tabsUrlTool = navigateTool;
const tabsWaitTool = waitTool;

// Helper stubs for names referenced in the export block
function formatTabGroupInfo(group: any): string {
  return JSON.stringify(group);
}
function getAnonymousIdForExport(): Promise<string> {
  return getOrCreateAnonymousId();
}
function getToolSchemas(tools: ToolDefinition[], context?: any): Promise<any[]> {
  return toolsToProviderSchema(tools, context);
}
function getToolNames(tools: ToolDefinition[]): string[] {
  return tools.map((t) => t.name);
}
function getToolSchemasForMcp(): Promise<any[]> {
  return toolsToProviderSchema(allTools);
}
function formatTabsForDisplay(tabs: any[]): string {
  return formatTabsOutput(tabs);
}
function formatTabInfo(tab: any): string {
  return `tabId ${tab.id}: "${tab.title}" (${tab.url})`;
}
function parseJsonArray(value: any): any[] {
  return parseArrayInput(value);
}
function formatPermissions(permissions: any): string {
  return JSON.stringify(permissions);
}

export {
  cdpDebugger,
  updatePlanTool,
  coerceToolInput,
  formatTabGroupInfo,
  getAnonymousIdForExport,
  getFeatureValue,
  getToolSchemas,
  getToolNames,
  getToolSchemasForMcp,
  getTabRelationship,
  getCategoryAndUpdateBlocklist,
  isBlockedCategory,
  getBlockedPageUrl,
  detectDomainTransition,
  createDomainTransitionPermission,
  categoryChecker,
  tabsExecuteJsTool,
  initializeAnalytics,
  identifyUser,
  formatTabsForDisplay,
  refreshFeatures,
  tabsUrlTool,
  tabsActivateTool,
  tabsNewTool,
  formatTabsOutput,
  tabsWaitTool,
  tabsQueryTool,
  extractAppName,
  normalizeUrl,
  navigateTool,
  computerTool,
  formatTabInfo,
  pageContentTool,
  parseJsonArray,
  tabsNavigateBackTool,
  screenshotTool,
  formatPermissions,
  tabsUpdateTool,
  tabsCloseTool,
  tabsGroupTool,
  waitTool,
  tabsGetContentTool,
  tabsExecuteScriptTool,
  todoListTool,
  todoUpdateTool,
  shouldShowPlanMode,
  getPlanModeSystemReminder,
  filterAndApproveDomains,
  filterDomainsByCategory,
  javascriptTool,
  trackEvent
};
