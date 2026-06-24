import type { Span } from '@opentelemetry/api';
import { compressBase64Image } from '../utils/imageCompressor';
import {
  StorageKeys,
  getStorageValue,
  setStorageValue,
  getOrCreateAnonymousId,
  PermissionDuration as PermissionDurationEnum
} from '../extensionServices';
import { isRecord, type ApiToolResultBlock, type ApiToolResultContentBlock } from '../messageTypes';
import { MessagesClient } from '../mcpServersStore';
import { withTracing, PermissionManager as PermissionManagerClass } from '../PermissionManager';
import {
  dispatchMessagesClient,
  clearDispatchClientCache,
  resolveClientForProvider
} from '../utils/providerClient';
import {
  PROVIDER_CONFIG_BROADCAST,
  PROVIDER_STORAGE_KEYS,
  loadProviderConfig
} from '../utils/providerStore';
import { getFirstUsableProvider } from '../utils/providerConfigStatus';
import {
  MCP_NATIVE_SESSION_ID,
  PermissionType,
  extractAppName,
  formatTabsOutput,
  normalizeUrl
} from './shared';
import { categoryChecker, tabGroupManager } from './tabState';
import { gifFrameStorage } from './mediaTools';
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
  validateToolInput,
  toolsToProviderSchema,
  parseArrayInput,
  shouldShowPlanMode,
  getPlanModeSystemReminder,
  filterAndApproveDomains,
  filterDomainsByCategory
} from './browserAutomation';
import { getFeatureValue, refreshFeatures, trackEvent, initializeAnalytics } from './analytics';
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
  content: NonNullable<ApiToolResultBlock['content']>;
  is_error: boolean;
};
type ExecuteToolResponse = {
  actionData?: Record<string, unknown>;
  base64Image?: string;
  content?: ApiToolResultBlock['content'];
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
type RecordedFrame = {
  base64: string;
  action?: Record<string, unknown>;
  frameNumber?: number;
  timestamp?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  devicePixelRatio?: number;
};
type RecordedAction = {
  type: string;
  coordinate?: unknown;
  description?: string;
  start_coordinate?: unknown;
  text?: string;
  timestamp?: number;
  [key: string]: unknown;
};
type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: { platform?: string };
};

const TOOLS_WITH_INTERNAL_DEBUGGER_MANAGEMENT = new Set(['browser_batch']);
const DEBUGGER_ATTACH_TIMEOUT_MS = 10000;
const TOOLS_WITH_SCRIPT_FALLBACK_ON_DEBUGGER_FAILURE = new Set([
  'read_page',
  'find',
  'get_page_text',
  'form_input'
]);

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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

function validateInput(
  toolName: string,
  input: unknown,
  tools: ToolDefinition[]
): { valid: boolean; errors: string[] } {
  return validateToolInput(toolName, input, tools);
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
let currentDeviceId: string | null = null;

// Maximum number of consecutive reconnection attempts before giving up.
// After ~15 retries with exponential backoff (capped at 20s), this gives
// roughly 4-5 minutes of retries before stopping. Users can manually
// trigger connectBridge() to restart the cycle.
const MAX_BRIDGE_RETRIES = 15;

async function getBridgeDisplayName(): Promise<string | undefined> {
  return (await chrome.storage.local.get('bridgeDisplayName')).bridgeDisplayName as
    | string
    | undefined;
}

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
  // Feature flag 'chrome_ext_bridge_enabled' always returned false; bridge is disabled.
  return undefined;
}

// Forward declarations for functions used before definition
let lastPairingRequestId: string | undefined;

function clearAllPendingToolCalls(
  reason: 'bridge_disconnected' | 'manual_disconnect' = 'bridge_disconnected'
): void {
  for (const [, entry] of pendingToolCalls) {
    // Resolve false is ambiguous — was it "user denied" or "infrastructure
    // failed"? Per RoboCFO: structured actionable errors. We log the reason
    // so the operator can distinguish permission denial from bridge loss.
    console.warn(
      `[clearAllPendingToolCalls] resolving pending request as false (reason: ${reason})`
    );
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
  if (retryCount > MAX_BRIDGE_RETRIES) {
    trackEvent('superduck.bridge.reconnect_exhausted', {
      attempts: retryCount - 1,
      max_retries: MAX_BRIDGE_RETRIES
    });
    return;
  }
  const delay = Math.min(2000 * Math.pow(1.5, retryCount - 1), 20000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectBridge(false);
  }, delay);
}

// --- connectBridge (ir) --- EXPORT
export async function connectBridge(resetRetries: boolean = true): Promise<boolean> {
  if (resetRetries) retryCount = 0;
  if (bridgeWebSocket?.readyState === WebSocket.OPEN || bridgeConnecting) return false;
  bridgeConnecting = true;
  const bridgeUrl = await getBridgeUrl();
  if (!bridgeUrl) {
    bridgeConnecting = false;
    return false;
  }
  try {
    const deviceId = await getDeviceId();
    currentDeviceId = deviceId;
    const displayName = await getBridgeDisplayName();
    const wsUrl = `${bridgeUrl}/chrome`;
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
        clearAllPendingToolCalls('bridge_disconnected');
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
      success: !result.error
    });
    const bridgePayload: Record<string, unknown> = {
      ...result,
      type: 'tool_result',
      tool_use_id: toolUseId
    };
    if (typeof bridgePayload.error === 'string') {
      bridgePayload.error = {
        content: [{ type: 'text', text: bridgePayload.error }]
      };
    }
    sendBridgeMessage(bridgePayload);
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
  clearAllPendingToolCalls('manual_disconnect');
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
          createApiMessage: this.createApiMessage(),
          availableTools: allTools
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

        // Audit: include safe, low-cardinality input fields for traceability.
        // Per RoboCFO: "record every action, tool call." Avoid PII — only
        // include structural parameters (filter, depth, mode), not user data.
        const input = isRecord(toolInput) ? toolInput : {};
        if (typeof input.filter === 'string') trackData.input_filter = input.filter;
        if (typeof input.depth === 'number') trackData.input_depth = input.depth;
        if (typeof input.limit === 'number') trackData.input_limit = input.limit;
        if (typeof input.clear === 'boolean') trackData.input_clear = input.clear;
        if (typeof input.diff === 'boolean') trackData.input_diff = input.diff;
        if (typeof input.newTab === 'boolean') trackData.input_new_tab = input.newTab;
        if (typeof input.full === 'boolean') trackData.input_full = input.full;
        if (typeof input.allowCrossOrigin === 'boolean')
          trackData.input_cross_origin = input.allowCrossOrigin;

        try {
          const coercedInput = coerceToolInput(toolName, toolInput, allTools);
          // Schema-driven runtime validation. The `parameters` declaration
          // on each `ToolDefinition` already specifies `minimum` / `maximum`
          // / `enum` / `required` / etc — `coerceToolInputTypes` only does
          // string→number / string→boolean coercion, so the *enforcement*
          // has to live somewhere. Doing it here, before `tool.execute()`,
          // means a malicious or buggy model that passes an out-of-range
          // `duration: 999` to the `computer` tool gets a structured error
          // instead of letting the bad value flow into the CDP layer.
          const validation = validateInput(toolName, coercedInput, allTools);
          if (!validation.valid) {
            trackData.success = false;
            span.setAttribute('success', false);
            span.setAttribute('failure_reason', 'invalid_input');
            return createErrorResponse(
              `Invalid input for ${toolName}: ${validation.errors.join('; ')}`
            );
          }
          const result = await tool.execute(coercedInput, executionContext);
          const failed =
            result.type === 'permission_required' || !!result.error || result.is_error === true;

          if (result.type === 'permission_required') {
            trackData.success = false;
            span.setAttribute('success', false);
            span.setAttribute('failure_reason', 'needs_permission');
          } else {
            trackData.success = !failed;
            span.setAttribute('success', !failed);
            if (failed) span.setAttribute('failure_reason', 'tool_error');
          }

          if (!failed && executionContext.tabId) {
            await recordToolAction(toolName, coercedInput, executionContext.tabId);
          }

          void trackEvent('superduck.chat.tool_called', trackData);
          return result;
        } catch (err) {
          void trackEvent('superduck.chat.tool_called', {
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
        const { modelClass: _modelClass, maxTokens, max_tokens: legacyMaxTokens, ...rest } = params;
        // model is now the selected provider id; tier/fast-model switching removed.
        const model = this.context.model;
        // Dispatch to the selected provider (falls back to context.messagesClient).
        const dispatched = await dispatchMessagesClient(model, this.context.messagesClient);
        const requestedMaxTokens = maxTokens ?? legacyMaxTokens;
        if (typeof requestedMaxTokens !== 'number') {
          throw new Error('maxTokens is required');
        }
        return await dispatched.runtime.create({
          ...rest,
          max_tokens: requestedMaxTokens,
          model: dispatched.modelId
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
      if (typeof result.content === 'string') {
        content.push({ type: 'text', text: result.content });
      } else if (Array.isArray(result.content)) {
        content.push(...(result.content as ApiToolResultContentBlock[]));
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
      const isError = !!result.error || result.is_error === true;
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
    if (!gifFrameStorage.isRecording(groupId)) return;

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
      const frames = gifFrameStorage.getFrames(groupId);
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
        // Cast: GifFrameData.action is `GifAction` (requires `type: string`)
        // but `RecordedAction` here comes from a record-widened union; the
        // actual shape satisfies the contract at runtime.
        gifFrameStorage.addFrame(
          groupId,
          frameWithAction as Parameters<typeof gifFrameStorage.addFrame>[1]
        );
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

    const frameNumber = gifFrameStorage.getFrames(groupId).length;
    const frame: RecordedFrame = {
      base64: screenshotData.base64,
      action: actionData,
      frameNumber,
      timestamp: Date.now(),
      viewportWidth: screenshotData.viewportWidth || screenshotData.width,
      viewportHeight: screenshotData.viewportHeight || screenshotData.height,
      devicePixelRatio
    };
    // Cast: see note above re: GifAction shape.
    gifFrameStorage.addFrame(groupId, frame as Parameters<typeof gifFrameStorage.addFrame>[1]);
  } catch {
    // silently fail
  }
}

// =============================================================================
// Main Logic and Exports (lines 6988-7317)
// =============================================================================

let cachedMessagesClient: MessagesClient | undefined;
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
  // selectedModel now stores a provider id (empty string = nothing selected).
  const storedModel = await getStorageValue<string>(StorageKeys.SELECTED_MODEL);
  return typeof storedModel === 'string' ? storedModel : '';
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
  const storedValues = await chrome.storage.local.get([
    StorageKeys.API_KEY,
    'customApiUrl',
    'customApiKey'
  ]);
  const storedApiKey = storedValues[StorageKeys.API_KEY] as string | undefined;
  const customApiUrl = storedValues.customApiUrl as string | undefined;
  const customApiKey = storedValues.customApiKey as string | undefined;
  const normalizedCustomApiUrl =
    typeof customApiUrl === 'string' ? customApiUrl.trim().replace(/\/+$/, '') : '';
  const apiBaseUrl = normalizedCustomApiUrl;
  const apiKey =
    (typeof customApiKey === 'string' && customApiKey.trim()) ||
    (typeof storedApiKey === 'string' && storedApiKey.trim()) ||
    undefined;
  if (lastApiKey !== apiKey || lastApiBaseUrl !== apiBaseUrl) {
    cachedMessagesClient = undefined;
    lastApiKey = apiKey;
    lastApiBaseUrl = apiBaseUrl;
  }
  if (cachedMessagesClient) return cachedMessagesClient;
  if (apiKey && apiBaseUrl) {
    cachedMessagesClient = new MessagesClient({
      baseURL: apiBaseUrl,
      dangerouslyAllowBrowser: true,
      apiKey
    });
    return cachedMessagesClient;
  }
  // Fall back to the provider the user selected; if the stored selection is
  // empty / stale (e.g. a legacy canonical model id, or the provider was
  // deleted), try any ready provider so background tool calls still reach a
  // model instead of silently getting no client.
  const selectedModel = await getSelectedModel();
  let resolved = await resolveClientForProvider(selectedModel || undefined);
  if (!resolved) {
    const config = await loadProviderConfig();
    const fallbackProvider = getFirstUsableProvider(config);
    if (fallbackProvider) {
      resolved = await resolveClientForProvider(fallbackProvider.id);
    }
  }
  if (resolved) {
    cachedMessagesClient = new MessagesClient({
      baseURL: resolved.baseURL,
      dangerouslyAllowBrowser: true,
      apiKey: resolved.apiKey
    });
    return cachedMessagesClient;
  }
  return undefined;
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
  void persistActiveToolCount();
  try {
    return await executeToolInner(options);
  } finally {
    activeToolCount--;
    if (activeToolCount <= 0) {
      activeToolCount = 0;
    }
    void persistActiveToolCount();
    if (activeToolCount === 0) {
      onAgentBecameIdleCallback?.();
    }
  }
}

/**
 * Persist the active tool count to storage so it survives an SW restart.
 * `service-worker.ts` reads this back in `onStartup` to make
 * `isAgentActive()` return the right value across restarts and prevent
 * `tryApplyUpdate` from reloading Chrome into a running agent.
 *
 * The on-disk count is treated as a backup; the in-memory `activeToolCount`
 * is the source of truth at runtime. Storage writes are fire-and-forget —
 * we only need eventual consistency.
 */
async function persistActiveToolCount(): Promise<void> {
  try {
    await setStorageValue(StorageKeys.ACTIVE_TOOL_COUNT, activeToolCount);
  } catch (err) {
    console.warn('[core] failed to persist activeToolCount', err);
  }
}

/**
 * Restore the in-memory `activeToolCount` from storage. Called from
 * `service-worker.ts` on `chrome.runtime.onStartup`. If no value is
 * present (fresh install or pre-fix migration), defaults to 0.
 */
export async function restoreActiveToolCountFromStorage(): Promise<void> {
  try {
    const stored = await getStorageValue<number>(StorageKeys.ACTIVE_TOOL_COUNT);
    if (typeof stored === 'number' && Number.isFinite(stored) && stored >= 0) {
      activeToolCount = Math.floor(stored);
    } else {
      activeToolCount = 0;
    }
  } catch (err) {
    console.warn('[core] failed to restore activeToolCount', err);
    activeToolCount = 0;
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
    return createErrorResponse(
      'No tabs available. Please open a new tab or window in your browser.'
    );
  }

  if (
    tabId !== undefined &&
    !TOOLS_WITH_INTERNAL_DEBUGGER_MANAGEMENT.has(options.toolName) &&
    !TOOLS_WITH_SCRIPT_FALLBACK_ON_DEBUGGER_FAILURE.has(options.toolName)
  ) {
    try {
      let wasAttached = false;
      try {
        wasAttached = await withTimeout(
          cdpDebugger.isDebuggerAttached(tabId),
          DEBUGGER_ATTACH_TIMEOUT_MS,
          'Timed out checking debugger attachment'
        );
      } catch {
        wasAttached = false;
      }
      await withTimeout(
        cdpDebugger.attachDebugger(tabId),
        DEBUGGER_ATTACH_TIMEOUT_MS,
        'Timed out attaching debugger'
      );
      if (!wasAttached) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (attachErr) {
      // Chrome internal pages (chrome://, edge://, etc.) cannot be debugged —
      // silently skip CDP for them. For all other tabs, report the failure so
      // the agent receives an actionable error instead of a confusing downstream
      // CDP error (e.g. "No debugger attached" when the user clicked Cancel).
      const isInternalPage =
        url === undefined ||
        url === '' ||
        url?.startsWith('chrome://') ||
        url?.startsWith('chrome-extension://') ||
        url?.startsWith('edge://') ||
        url?.startsWith('brave://') ||
        url?.startsWith('about:');
      if (
        !isInternalPage &&
        !TOOLS_WITH_SCRIPT_FALLBACK_ON_DEBUGGER_FAILURE.has(options.toolName)
      ) {
        trackEvent('superduck.mcp.tool_called', {
          tool_name: options.toolName,
          client_id: options.clientId,
          model: await getSelectedModel(),
          success: false,
          error_type: 'debugger_attach_failed',
          duration_ms: Date.now() - startTime
        });
        return createErrorResponse(
          `Failed to attach debugger to tab: ${attachErr instanceof Error ? attachErr.message : String(attachErr)}. The user may have declined the Chrome debugger prompt, or the tab may have been closed. Please try again or use a different tab.`
        );
      }
      console.warn(
        `[executeTool] continuing ${options.toolName} without debugger after attach failure:`,
        attachErr
      );
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

  // Audit: include safe input parameters for traceability
  const mcpArgs = isRecord(options.args) ? options.args : {};
  const mcpInputFields: Record<string, unknown> = {};
  if (typeof mcpArgs.action === 'string') mcpInputFields.action = mcpArgs.action;
  if (typeof mcpArgs.filter === 'string') mcpInputFields.input_filter = mcpArgs.filter;
  if (typeof mcpArgs.depth === 'number') mcpInputFields.input_depth = mcpArgs.depth;
  if (typeof mcpArgs.limit === 'number') mcpInputFields.input_limit = mcpArgs.limit;
  if (typeof mcpArgs.clear === 'boolean') mcpInputFields.input_clear = mcpArgs.clear;
  if (typeof mcpArgs.diff === 'boolean') mcpInputFields.input_diff = mcpArgs.diff;
  if (typeof mcpArgs.newTab === 'boolean') mcpInputFields.input_new_tab = mcpArgs.newTab;
  if (typeof mcpArgs.full === 'boolean') mcpInputFields.input_full = mcpArgs.full;

  trackEvent('superduck.mcp.tool_called', {
    tool_name: options.toolName,
    client_id: clientId,
    model,
    success: !isError,
    tab_id: tabId,
    tab_group_id: options.tabGroupId,
    duration_ms: Date.now() - startTime,
    ...mcpInputFields,
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
    currentUrl.startsWith('edge://') ||
    currentUrl.startsWith('brave://') ||
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
type PersistedActiveToolContext = {
  toolName: string;
  requestId: string;
  startTime: number;
};

const activeToolContexts = new Map<
  number,
  {
    toolName: string;
    requestId: string;
    startTime: number;
    errorCallback?: (error: string) => void;
  }
>();

/**
 * Serialize the active tool contexts Map into a plain record keyed by tabId.
 * `errorCallback` is a function and intentionally not persisted — after an SW
 * restart the callback is gone and any tool that errors out before completing
 * will simply not surface a UI error; the tool itself is allowed to finish.
 */
function serializeActiveToolContexts(): Record<string, PersistedActiveToolContext> {
  const out: Record<string, PersistedActiveToolContext> = {};
  for (const [tabId, ctx] of activeToolContexts) {
    out[String(tabId)] = {
      toolName: ctx.toolName,
      requestId: ctx.requestId,
      startTime: ctx.startTime
    };
  }
  return out;
}

async function persistActiveToolContexts(): Promise<void> {
  try {
    await setStorageValue(StorageKeys.ACTIVE_TOOL_CONTEXTS, serializeActiveToolContexts());
  } catch (err) {
    console.warn('[core] failed to persist activeToolContexts', err);
  }
}

/**
 * Restore the active tool contexts map from storage. Called from
 * `service-worker.ts` on `chrome.runtime.onStartup` so the in-memory Map
 * survives a service worker restart and the
 * `webNavigation.onBeforeNavigate` category interceptor keeps blocking
 * forbidden-domain navigations even after the SW is killed and respawned.
 *
 * `errorCallback` is not persisted (functions cannot cross the
 * serialization boundary); tools that error out before completing after an
 * SW restart will not surface a UI error, but the tool itself is allowed
 * to finish and the bookkeeping is intact.
 */
export async function restoreActiveToolContextsFromStorage(): Promise<void> {
  try {
    const stored = await getStorageValue<Record<string, PersistedActiveToolContext>>(
      StorageKeys.ACTIVE_TOOL_CONTEXTS
    );
    if (!stored) return;
    for (const [tabIdStr, ctx] of Object.entries(stored)) {
      const tabId = Number(tabIdStr);
      if (!Number.isInteger(tabId)) continue;
      activeToolContexts.set(tabId, { ...ctx });
    }
  } catch (err) {
    console.warn('[core] failed to restore activeToolContexts', err);
  }
}
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

  await tabGroupManager.clearIndicatorsForGroup(mainTabId).catch(() => {});
  await tabGroupManager.addCompletionPrefix(mainTabId).catch(() => {});
  await tabGroupManager.setGroupColor(mainTabId, chrome.tabGroups.Color.GREEN).catch(() => {});

  for (const tabId of memberIds) {
    await cdpDebugger.detachDebugger(tabId).catch(() => {});
  }

  groupFinalizationState.delete(mainTabId);
}

export function migrateGroupFinalizationState(oldMainTabId: number, newMainTabId: number): void {
  if (oldMainTabId === newMainTabId) return;
  const state = groupFinalizationState.get(oldMainTabId);
  if (!state) return;

  const existingState = groupFinalizationState.get(newMainTabId);
  if (existingState?.timer) clearTimeout(existingState.timer);

  const hadTimer = state.timer !== null;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  state.lastActiveTabId = newMainTabId;

  groupFinalizationState.delete(oldMainTabId);
  groupFinalizationState.set(newMainTabId, state);

  if (hadTimer && !hasActiveToolsInGroup(newMainTabId)) {
    state.timer = setTimeout(() => {
      if (!hasActiveToolsInGroup(newMainTabId)) {
        void finalizeGroup(newMainTabId);
      }
    }, PREFIX_CLEANUP_DELAY);
  }
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
  void persistActiveToolContexts();
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
  void persistActiveToolContexts();

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
