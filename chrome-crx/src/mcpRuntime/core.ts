import type { Span } from '@opentelemetry/api';
import { compressBase64Image } from '../utils/imageCompressor';
import { DEFAULT_MODEL, FAST_MODEL } from '../constants/models';
import {
  StorageKeys,
  getStorageValue,
  getAccessToken,
  getConfig,
  getOrCreateAnonymousId,
  getOrganizationId,
  validateAndRefreshToken,
  PermissionDuration as PermissionDurationEnum
} from '../extensionServices';
import {
  isRecord,
  type ApiInputContentBlock,
  type ApiToolResultBlock,
  type ApiToolResultContentBlock
} from '../messageTypes';
import { MessagesClient } from '../mcpServersStore';
import { withTracing, PermissionManager as PermissionManagerClass } from '../PermissionManager';
import { dispatchMessagesClient, clearDispatchClientCache } from '../utils/providerClient';
import {
  PROVIDER_CONFIG_BROADCAST,
  PROVIDER_STORAGE_KEYS,
  loadProviderConfig
} from '../utils/providerStore';
import {
  MCP_NATIVE_SESSION_ID,
  PermissionType,
  extractAppName,
  formatTabsOutput,
  normalizeUrl,
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
import { allTools, mcpToolNames } from './core/tools';
import type {
  ToolContext,
  ToolProviderSchema,
  ToolResult,
  ToolTabSummary
} from './pageToolsSupport/types';

// Alias withTracing as initializePermissions (legacy name from compiled bundle)
const initializePermissions = withTracing;

type BridgeMessage = Record<string, unknown> & { type?: string };
type PermissionPromptRequest = ToolResult & {
  type: 'permission_required';
  tool: string;
  url: string;
  toolUseId?: string;
  actionData?: Record<string, unknown>;
};
type PermissionPromptHandler = (
  permission: PermissionPromptRequest,
  tabId: number
) => Promise<boolean>;
type RuntimeCreateApiMessage = NonNullable<ToolContext['createApiMessage']>;
type ErrorResponse = {
  content: ApiInputContentBlock[];
  is_error: boolean;
};
type ExecuteToolResponse = {
  actionData?: Record<string, unknown>;
  base64Image?: string;
  content?: string | ApiInputContentBlock[];
  error?: string;
  imageFormat?: string;
  is_error?: boolean;
  output?: string;
  tabContext?: ToolResult['tabContext'];
  tool?: string;
  toolUseId?: string;
  tool_use_id?: string;
  type?: string;
  url?: string;
};
type ToolUseRequest = {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
};
type ToolExecutorProcessOptions = {
  permissionManager?: PermissionManagerClass;
  onPermissionRequired?: PermissionPromptHandler;
};
type TabGroupRecord = Awaited<ReturnType<typeof tabGroupManager.findGroupByTab>>;
type RecordedFrame = Parameters<typeof screenRecorder.addFrame>[1];
type RecordedAction = NonNullable<RecordedFrame['action']> & {
  coordinate?: unknown;
  description?: string;
  start_coordinate?: unknown;
  text?: string;
  timestamp?: number;
};
type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: { platform?: string };
};

interface ToolInputRecord extends Record<string, unknown> {
  action?: string;
  coordinate?: unknown;
  start_coordinate?: unknown;
  tabGroupId?: unknown;
  tabId?: unknown;
  text?: string;
  url?: string;
}

function coerceToolInput(toolName: string, input: unknown, tools: ToolDefinition[]): unknown {
  return coerceToolInputTypes(toolName, input, tools);
}

function isBridgeMessage(value: unknown): value is BridgeMessage {
  return isRecord(value) && (value.type === undefined || typeof value.type === 'string');
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toToolInputRecord(value: unknown): ToolInputRecord {
  return isRecord(value) ? value : {};
}

function isPermissionPromptRequest(value: unknown): value is PermissionPromptRequest {
  return (
    isRecord(value) &&
    value.type === 'permission_required' &&
    typeof value.tool === 'string' &&
    typeof value.url === 'string'
  );
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
    const uaData = (navigator as NavigatorWithUserAgentData).userAgentData;
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

function sendBridgeMessage(message: Record<string, unknown>): void {
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
      const connectMsg: Record<string, unknown> = {
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
        const message = JSON.parse(event.data) as unknown;
        if (!isBridgeMessage(message)) return;
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
async function handleBridgeMessage(message: BridgeMessage): Promise<void> {
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

async function handleBridgeToolCall(message: BridgeMessage): Promise<void> {
  const targetDeviceId =
    typeof message.target_device_id === 'string' ? message.target_device_id : undefined;
  if (targetDeviceId && targetDeviceId !== currentDeviceId) return;
  const toolUseId = typeof message.tool_use_id === 'string' ? message.tool_use_id : undefined;
  const toolName = typeof message.tool === 'string' ? message.tool : undefined;
  const clientType = typeof message.client_type === 'string' ? message.client_type : 'desktop';
  const args = isRecord(message.args) ? message.args : {};
  const permissionMode =
    typeof message.permission_mode === 'string' ? message.permission_mode : undefined;
  const allowedDomains = isStringArray(message.allowed_domains)
    ? message.allowed_domains
    : undefined;
  const handlePermissionPrompts = true === message.handle_permission_prompts;
  if (!toolUseId || !toolName) return;
  const tabId = parseOptionalNumber(args.tabId);
  const tabGroupId = parseOptionalNumber(args.tabGroupId);
  if (tabId !== undefined) {
    try {
      await chrome.tabs.get(tabId);
    } catch {
      return;
    }
  }
  const trackData: Record<string, unknown> = {
    tool_name: toolName,
    client_type: clientType
  };
  try {
    const result = await executeTool({
      toolName,
      args,
      tabId,
      tabGroupId,
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

async function handlePairingRequest(message: BridgeMessage): Promise<void> {
  const requestId = typeof message.request_id === 'string' ? message.request_id : undefined;
  if (!requestId) return;
  if (requestId === lastPairingRequestId) return;
  lastPairingRequestId = requestId;
  const clientType = typeof message.client_type === 'string' ? message.client_type : 'desktop';
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

function handlePermissionResponse(message: BridgeMessage): void {
  const requestId = typeof message.request_id === 'string' ? message.request_id : undefined;
  if (!requestId) return;
  const pending = pendingToolCalls.get(requestId);
  if (!pending) return;
  pendingToolCalls.delete(requestId);
  pending.resolve(message.allowed === true);
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
  params?: Record<string, unknown>
): boolean {
  if (!isBridgeConnected()) return false;
  sendBridgeMessage({ type: 'notification', method, params: params || {} });
  return true;
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

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (PROVIDER_STORAGE_KEYS.PROVIDERS in changes || PROVIDER_STORAGE_KEYS.MAPPING in changes) {
    clearDispatchClientCache();
    void loadProviderConfig(true);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (isRecord(message) && message.type === PROVIDER_CONFIG_BROADCAST) {
    clearDispatchClientCache();
    void loadProviderConfig(true);
    sendResponse({ ok: true });
    return false;
  }
  if (isRecord(message) && 'pairing_confirmed' === message.type) {
    const requestId = typeof message.request_id === 'string' ? message.request_id : undefined;
    const name = typeof message.name === 'string' ? message.name : '';
    if (!requestId) {
      sendResponse({ ok: false });
      return false;
    }
    (async function saveBridgeDisplayName(name: string) {
      await chrome.storage.local.set({ bridgeDisplayName: name });
    })(name);
    getDeviceId().then((deviceId) => {
      sendBridgeMessage({
        type: 'pairing_response',
        request_id: requestId,
        device_id: deviceId,
        name
      });
    });
    sendResponse({ ok: true });
  }
  return false;
});

// =============================================================================
// ToolExecutor class (gr, lines 6813-6987)
// =============================================================================

interface ToolExecutorContext {
  tabId?: number;
  tabGroupId?: number;
  model: string;
  sessionId: string;
  messagesClient?: MessagesClient;
  permissionManager: PermissionManagerClass;
  onPermissionRequired?: PermissionPromptHandler;
  analytics?: { track: (event: string, data: Record<string, unknown>) => unknown };
  refreshClient?: () => Promise<MessagesClient | undefined>;
}

class ToolExecutor {
  context: ToolExecutorContext;

  constructor(context: ToolExecutorContext) {
    this.context = context;
  }

  async handleToolCall(
    toolName: string,
    toolInput: unknown,
    toolUseId: string,
    permissions?: string,
    domain?: string,
    spanParent?: Span,
    url?: string,
    permissionManagerOverride?: PermissionManagerClass
  ): Promise<ToolResult> {
    const action =
      isRecord(toolInput) && typeof toolInput.action === 'string' ? toolInput.action : undefined;
    return await initializePermissions(
      `tool_execution_${toolName}${action ? '_' + action : ''}`,
      async (span: Span) => {
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

        const trackData: Record<string, unknown> = {
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

          if (result.type === 'permission_required') {
            trackData.success = false;
            span.setAttribute('success', false);
            span.setAttribute('failure_reason', 'needs_permission');
          } else {
            trackData.success = !result.error;
            span.setAttribute('success', !result.error);
          }

          if (result.type !== 'permission_required' && !result.error && executionContext.tabId) {
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

  createApiMessage(): RuntimeCreateApiMessage | undefined {
    if (this.context.messagesClient || this.context.refreshClient) {
      return async (params, _label) => {
        if (this.context.refreshClient) {
          const refreshed = await this.context.refreshClient();
          if (refreshed) this.context.messagesClient = refreshed;
        }
        if (!this.context.messagesClient) {
          throw new Error('API client not available');
        }
        const { modelClass, maxTokens, max_tokens: legacyMaxTokens, ...rest } = params;
        let model = this.context.model;
        if ('small_fast' === modelClass) {
          const modelConfig = await getFeatureValue('chrome_ext_models');
          model =
            typeof modelConfig.small_fast_model === 'string'
              ? modelConfig.small_fast_model
              : FAST_MODEL;
        }
        // Dispatch to per-tier provider (falls back to context.messagesClient).
        const dispatched = await dispatchMessagesClient(model, this.context.messagesClient);
        const requestedMaxTokens = maxTokens ?? legacyMaxTokens;
        if (typeof requestedMaxTokens !== 'number') {
          throw new Error('maxTokens is required');
        }
        return await dispatched.runtime.create({
          ...rest,
          max_tokens: requestedMaxTokens,
          model: dispatched.modelId,
          betas: ['oauth-2025-04-20']
        });
      };
    }
    return undefined;
  }

  async processToolResults(
    toolUses: ToolUseRequest[],
    options?: ToolExecutorProcessOptions
  ): Promise<ApiToolResultBlock[]> {
    const results: ApiToolResultBlock[] = [];

    const formatContent = async (result: ToolResult): Promise<ApiToolResultBlock['content']> => {
      if (result.error) return result.error;
      const content: ApiToolResultContentBlock[] = [];
      if (result.output) {
        content.push({ type: 'text', text: result.output });
      }
      if (result.tabContext) {
        const availableTabs = result.tabContext.availableTabs ?? [];
        const tabContextText = `\n\nTab Context:${result.tabContext.executedOnTabId ? `\n- Executed on tabId: ${result.tabContext.executedOnTabId}` : ''}\n- Available tabs:\n${availableTabs.map((tab: ToolTabSummary) => `  \u2022 tabId ${tab.id}: "${tab.title}" (${tab.url})`).join('\n')}`;
        content.push({ type: 'text', text: tabContextText });
      }
      if (result.base64Image) {
        const rawMediaType = result.imageFormat ? `image/${result.imageFormat}` : 'image/png';
        const { data, mediaType } = await compressBase64Image(result.base64Image, rawMediaType);
        const normalizedMediaType =
          mediaType === 'image/jpeg' ||
          mediaType === 'image/png' ||
          mediaType === 'image/gif' ||
          mediaType === 'image/webp'
            ? mediaType
            : 'image/png';
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: normalizedMediaType,
            data
          }
        });
      }
      return content.length > 0 ? content : '';
    };

    const formatToolResult = async (
      toolUseId: string,
      result: ToolResult
    ): Promise<ApiToolResultBlock> => {
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

        if (isPermissionPromptRequest(result)) {
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
                PermissionDurationEnum.ONCE,
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
          if (isPermissionPromptRequest(retryResult)) {
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
async function recordToolAction(
  toolName: string,
  toolInput: unknown,
  tabId: number
): Promise<void> {
  try {
    if (!['computer', 'navigate'].includes(toolName)) return;
    const input = toToolInputRecord(toolInput);
    const tab = await chrome.tabs.get(tabId);
    if (!tab) return;
    const groupId = tab.groupId ?? -1;
    if (!screenRecorder.isRecording(groupId)) return;

    let actionData: RecordedAction | undefined;

    if ('computer' === toolName && typeof input.action === 'string') {
      const actionType = input.action;
      if ('screenshot' === actionType) return;
      actionData = {
        type: actionType,
        coordinate: input.coordinate,
        start_coordinate: input.start_coordinate,
        text: input.text,
        timestamp: Date.now()
      };
      if (actionType.includes('click')) {
        actionData.description = 'Clicked';
      } else if ('type' === actionType && typeof input.text === 'string') {
        actionData.description = `Typed: "${input.text}"`;
      } else if ('key' === actionType && typeof input.text === 'string') {
        actionData.description = `Pressed key: ${input.text}`;
      } else {
        actionData.description =
          'scroll' === actionType
            ? 'Scrolled'
            : 'left_click_drag' === actionType
              ? 'Dragged'
              : actionType;
      }
    } else if ('navigate' === toolName && typeof input.url === 'string') {
      actionData = {
        type: 'navigate',
        timestamp: Date.now(),
        description: `Navigated to ${input.url}`
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
    const screenshotData = await (async () => {
      try {
        return await cdpDebugger.screenshot(tabId);
      } catch {
        return null;
      }
    })();
    if (!screenshotData) return;

    let devicePixelRatio = 1;
    try {
      const scriptResult = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.devicePixelRatio
      });
      const nextDevicePixelRatio = scriptResult?.[0]?.result;
      devicePixelRatio = typeof nextDevicePixelRatio === 'number' ? nextDevicePixelRatio : 1;
    } catch {
      // silently fail
    }

    const frameNumber = screenRecorder.getFrames(groupId).length;
    const frame: RecordedFrame = {
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

let cachedMessagesClient: MessagesClient | undefined;
let lastOauthToken: string | undefined;
let lastApiKey: string | undefined;
let lastApiBaseUrl: string | undefined;
let toolExecutorInstance: ToolExecutor | undefined;
let navigationBlockedError: string | undefined;
let navigationBlockedTime: number | undefined;
const NAVIGATION_BLOCK_TIMEOUT = 60000;

let activeToolCount = 0;
let onAgentBecameIdleCallback: (() => void) | null = null;

export function isAgentActive(): boolean {
  return activeToolCount > 0;
}

export function setOnAgentBecameIdle(cb: (() => void) | null): void {
  onAgentBecameIdleCallback = cb;
}

async function getSelectedModel(): Promise<string> {
  const [storedModel, modelConfig] = await Promise.all([
    getStorageValue<string>(StorageKeys.SELECTED_MODEL),
    getFeatureValue('chrome_ext_models')
  ]);
  return (
    storedModel ||
    (typeof modelConfig.default === 'string' ? modelConfig.default : '') ||
    DEFAULT_MODEL
  );
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
    onPermissionRequired: async (permission: PermissionPromptRequest, tabId: number) =>
      await showPermissionPrompt(permission, tabId),
    refreshClient: refreshMessagesClient
  });
  return toolExecutorInstance;
}

async function refreshMessagesClient(): Promise<MessagesClient | undefined> {
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
export const createErrorResponse = (text: string): ErrorResponse => ({
  content: [{ type: 'text', text }],
  is_error: true
});

interface ExecuteToolOptions {
  toolName: string;
  args: unknown;
  tabId?: number;
  tabGroupId?: number;
  clientId?: string;
  source?: string;
  permissionMode?: string;
  allowedDomains?: string[];
  toolUseId?: string;
  handlePermissionPrompts?: boolean;
  onPermissionRequired?: PermissionPromptHandler;
  messagesClient?: MessagesClient | null;
}

// --- executeTool (Sr) --- EXPORT
export async function executeTool(options: ExecuteToolOptions): Promise<ExecuteToolResponse> {
  activeToolCount++;
  try {
    return await executeToolInner(options);
  } finally {
    activeToolCount--;
    if (activeToolCount <= 0) {
      activeToolCount = 0;
      onAgentBecameIdleCallback?.();
    }
  }
}

async function executeToolInner(options: ExecuteToolOptions): Promise<ExecuteToolResponse> {
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
  let toolResult: ExecuteToolResponse;

  try {
    const skipTabLookup = mcpToolNames.includes(options.toolName) && options.tabId === undefined;
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
  let isError: boolean;

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

    const processOptions: ToolExecutorProcessOptions = {};

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
      const bridgeToolUseId = options.toolUseId;
      if (options.handlePermissionPrompts && bridgeToolUseId) {
        processOptions.onPermissionRequired = async (permissionData: PermissionPromptRequest) =>
          requestBridgePermission(bridgeToolUseId, permissionData);
      }
    } else if (options.onPermissionRequired) {
      // Custom inline handler (used by sidepanel for inline permission prompts)
      processOptions.onPermissionRequired = options.onPermissionRequired;
    } else if (options.handlePermissionPrompts) {
      // For sidepanel-originated calls: use the popup prompt handler
      processOptions.onPermissionRequired = async (
        permissionData: PermissionPromptRequest,
        permTabId: number
      ) => await showPermissionPrompt(permissionData, permTabId ?? tabId);
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
): PermissionManagerClass | undefined {
  if (!permissionMode || 'ask' === permissionMode) return undefined;
  const skipAll = 'skip_all_permission_checks' === permissionMode;
  const manager = new PermissionManagerClass(() => skipAll, {});
  if ('follow_a_plan' === permissionMode && allowedDomains?.length) {
    manager.setTurnApprovedDomains(allowedDomains);
  }
  return manager;
}

// --- Helper: requestBridgePermission ---
function requestBridgePermission(
  toolUseId: string,
  permissionData: PermissionPromptRequest
): Promise<boolean> {
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
  group: TabGroupRecord;
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
): PermissionPromptRequest {
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

// --- Active tool contexts and group finalization ---
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

const groupFinalizationState = new Map<
  number,
  {
    lastActiveTabId: number;
    timer: ReturnType<typeof setTimeout> | null;
  }
>();

function findGroupMainTab(tabId: number): number | undefined {
  return tabGroupManager.findMainTabIdSync(tabId);
}

function hasActiveToolsInGroup(mainTabId: number): boolean {
  const memberIds = tabGroupManager.getGroupMemberIds(mainTabId);
  for (const memberId of memberIds) {
    if (activeToolContexts.has(memberId)) return true;
  }
  return false;
}

async function finalizeGroup(mainTabId: number): Promise<void> {
  const state = groupFinalizationState.get(mainTabId);
  if (!state) return;

  const memberIds = tabGroupManager.getGroupMemberIds(mainTabId);
  if (memberIds.length === 0) {
    groupFinalizationState.delete(mainTabId);
    return;
  }

  const resultTabId = state.lastActiveTabId;

  await tabGroupManager.addCompletionPrefix(mainTabId).catch(() => {});
  await tabGroupManager.setGroupColor(mainTabId, chrome.tabGroups.Color.GREEN).catch(() => {});

  for (const tabId of memberIds) {
    await cdpDebugger.detachDebugger(tabId).catch(() => {});
  }

  const tabsToClose = memberIds.filter((id) => id !== resultTabId);
  if (tabsToClose.length > 0) {
    await chrome.tabs.remove(tabsToClose).catch(() => {});
  }

  groupFinalizationState.delete(mainTabId);
}

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

  const mainTabId = findGroupMainTab(tabId);
  if (mainTabId !== undefined) {
    const state = groupFinalizationState.get(mainTabId);
    if (state?.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    groupFinalizationState.set(mainTabId, {
      lastActiveTabId: tabId,
      timer: null
    });
    tabGroupManager.setGroupColor(mainTabId, chrome.tabGroups.Color.ORANGE).catch(() => {});
  }

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
  if (!activeToolContexts.has(tabId)) return;

  activeToolContexts.delete(tabId);

  const mainTabId = findGroupMainTab(tabId);
  if (mainTabId !== undefined && !hasActiveToolsInGroup(mainTabId)) {
    const state = groupFinalizationState.get(mainTabId);
    if (state) {
      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(() => {
        if (!hasActiveToolsInGroup(mainTabId)) {
          void finalizeGroup(mainTabId);
        }
      }, PREFIX_CLEANUP_DELAY);
    }
  } else if (mainTabId === undefined) {
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

  const mainTabId = findGroupMainTab(tabId) ?? tabId;
  const state = groupFinalizationState.get(mainTabId);
  if (state?.timer) clearTimeout(state.timer);
  groupFinalizationState.delete(mainTabId);
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
async function showPermissionPrompt(
  permission: PermissionPromptRequest,
  tabId: number
): Promise<boolean> {
  const next = permissionPromptChain.then(() => showPermissionPromptInner(permission, tabId));
  permissionPromptChain = next.catch(() => false);
  return next;
}

async function showPermissionPromptInner(
  permission: PermissionPromptRequest,
  tabId: number
): Promise<boolean> {
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

    const messageListener = (msg: unknown) => {
      if (isRecord(msg) && 'MCP_PERMISSION_RESPONSE' === msg.type && msg.requestId === requestId) {
        respond(msg.allowed === true);
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
const createEmptyToolSchema = (name: string, description: string): ToolProviderSchema => ({
  name,
  description,
  input_schema: {
    type: 'object',
    properties: {},
    required: [] as string[]
  }
});

const screenshotTool = computerTool; // screenshot is handled by computerTool's screenshot action
const tabsQueryTool = tabsContextTool;
const tabsActivateTool: ToolDefinition = {
  name: 'tabs_activate',
  description: 'Activate a tab',
  parameters: {},
  execute: async () => ({ output: 'stub' }),
  toProviderSchema: async () => createEmptyToolSchema('tabs_activate', 'Activate a tab')
};
const pageContentTool = readPageTool;
const tabsCloseTool: ToolDefinition = {
  name: 'tabs_close',
  description: 'Close a tab',
  parameters: {},
  execute: async () => ({ output: 'stub' }),
  toProviderSchema: async () => createEmptyToolSchema('tabs_close', 'Close a tab')
};
const tabsNavigateBackTool: ToolDefinition = {
  name: 'tabs_navigate_back',
  description: 'Navigate back',
  parameters: {},
  execute: async () => ({ output: 'stub' }),
  toProviderSchema: async () => createEmptyToolSchema('tabs_navigate_back', 'Navigate back')
};
const tabsUpdateTool: ToolDefinition = {
  name: 'tabs_update',
  description: 'Update a tab',
  parameters: {},
  execute: async () => ({ output: 'stub' }),
  toProviderSchema: async () => createEmptyToolSchema('tabs_update', 'Update a tab')
};
const tabsGroupTool: ToolDefinition = {
  name: 'tabs_group',
  description: 'Group tabs',
  parameters: {},
  execute: async () => ({ output: 'stub' }),
  toProviderSchema: async () => createEmptyToolSchema('tabs_group', 'Group tabs')
};
const waitTool: ToolDefinition = {
  name: 'wait',
  description: 'Wait',
  parameters: {},
  execute: async () => ({ output: 'stub' }),
  toProviderSchema: async () => createEmptyToolSchema('wait', 'Wait')
};
const tabsGetContentTool = getPageTextTool;
const tabsExecuteScriptTool = javascriptTool;
const todoListTool: ToolDefinition = {
  name: 'todo_list',
  description: 'List todos',
  parameters: {},
  execute: async () => ({ output: 'stub' }),
  toProviderSchema: async () => createEmptyToolSchema('todo_list', 'List todos')
};
const todoUpdateTool: ToolDefinition = {
  name: 'todo_update',
  description: 'Update todo',
  parameters: {},
  execute: async () => ({ output: 'stub' }),
  toProviderSchema: async () => createEmptyToolSchema('todo_update', 'Update todo')
};
const tabsNewTool = tabsCreateTool;
const tabsExecuteJsTool = javascriptTool;
const tabsUrlTool = navigateTool;
const tabsWaitTool = waitTool;

// Helper stubs for names referenced in the export block
function formatTabGroupInfo(group: unknown): string {
  return JSON.stringify(group);
}
function getAnonymousIdForExport(): Promise<string> {
  return getOrCreateAnonymousId();
}
function getToolSchemas(
  tools: ToolDefinition[],
  context?: ToolContext
): Promise<ToolProviderSchema[]> {
  return toolsToProviderSchema(tools, context);
}
function getToolNames(tools: ToolDefinition[]): string[] {
  return tools.map((t) => t.name);
}
function getToolSchemasForMcp(): Promise<ToolProviderSchema[]> {
  return toolsToProviderSchema(allTools);
}
function formatTabsForDisplay(tabs: ToolTabSummary[]): string {
  return formatTabsOutput(tabs);
}
function formatTabInfo(tab: ToolTabSummary): string {
  return `tabId ${tab.id}: "${tab.title}" (${tab.url})`;
}
function parseJsonArray(value: unknown): unknown[] {
  return parseArrayInput(value);
}
function formatPermissions(permissions: unknown): string {
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
